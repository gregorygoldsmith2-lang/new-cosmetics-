// api/cron/monitor.ts
// Vercel serverless function that runs daily at 9 AM PT
// Fetches sources, detects changes, runs LLM analysis

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

interface Source {
  id: string;
  name: string;
  url: string;
  source_type: string;
}

export default async function handler(req: Request) {
  // Verify this is called by Vercel Cron
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  console.log('Starting daily regulatory monitor...');
  
  try {
    // Get all active sources
    const { data: sources, error } = await supabase
      .from('sources')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;

    const results = [];
    
    for (const source of sources as Source[]) {
      console.log(`Checking source: ${source.name}`);
      const result = await checkSource(source);
      results.push(result);
    }

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      results
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Monitor error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function checkSource(source: Source) {
  try {
    // Fetch the page
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'Cosmetics-Regulatory-Monitor/1.0 (Educational/Research Purpose)'
      }
    });

    if (!response.ok) {
      await saveSnapshot(source.id, '', '', 'error', `HTTP ${response.status}`, response.status);
      return { source: source.name, status: 'error', httpStatus: response.status };
    }

    const rawHtml = await response.text();
    const rawHash = crypto.createHash('sha256').update(rawHtml).digest('hex');

    // Get the most recent snapshot for this source
    const { data: lastSnapshot } = await supabase
      .from('snapshots')
      .select('*')
      .eq('source_id', source.id)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single();

    // Save current snapshot
    const { data: newSnapshot } = await supabase
      .from('snapshots')
      .insert({
        source_id: source.id,
        raw_html: rawHtml,
        raw_hash: rawHash,
        fetch_status: 'success',
        http_status: response.status
      })
      .select()
      .single();

    // Check if content changed
    if (lastSnapshot && lastSnapshot.raw_hash === rawHash) {
      console.log(`No change detected for ${source.name}`);
      return { source: source.name, status: 'unchanged' };
    }

    // Content changed! Analyze with LLM
    console.log(`Change detected for ${source.name}! Running analysis...`);
    const analysis = await analyzeDiff(
      source,
      lastSnapshot?.raw_html || '',
      rawHtml
    );

    // Create change event
    await supabase
      .from('change_events')
      .insert({
        source_id: source.id,
        snapshot_before_id: lastSnapshot?.id || null,
        snapshot_after_id: newSnapshot.id,
        change_summary: analysis.summary,
        tags: analysis.tags,
        status: analysis.status,
        effective_date: analysis.effectiveDate,
        needs_review: analysis.needsReview
      });

    return { 
      source: source.name, 
      status: 'changed',
      summary: analysis.summary 
    };

  } catch (error) {
    console.error(`Error checking ${source.name}:`, error);
    await saveSnapshot(source.id, '', '', 'error', error.message, null);
    return { source: source.name, status: 'error', error: error.message };
  }
}

async function saveSnapshot(
  sourceId: string,
  html: string,
  hash: string,
  status: string,
  errorMsg: string | null,
  httpStatus: number | null
) {
  await supabase.from('snapshots').insert({
    source_id: sourceId,
    raw_html: html,
    raw_hash: hash,
    fetch_status: status,
    error_message: errorMsg,
    http_status: httpStatus
  });
}

async function analyzeDiff(source: Source, oldHtml: string, newHtml: string) {
  const prompt = `You are analyzing a change to a cosmetics regulatory source.

Source: ${source.name}
URL: ${source.url}

Your task: Analyze what changed and extract key information.

Previous content length: ${oldHtml.length} characters
New content length: ${newHtml.length} characters

NEW CONTENT:
${newHtml.substring(0, 15000)}

${oldHtml ? `PREVIOUS CONTENT (for comparison):
${oldHtml.substring(0, 10000)}` : 'No previous content available (first fetch).'}

Analyze the change and respond in JSON format with these fields:
{
  "summary": "Plain English summary (2-3 sentences) of what changed and why it matters",
  "tags": ["array", "of", "relevant", "tags"], // e.g., "labeling", "ingredient-ban", "reporting-deadline"
  "status": "draft|proposal|final|guidance|unknown", // document status if determinable
  "effectiveDate": "YYYY-MM-DD or null", // when this matters, if stated
  "needsReview": true|false, // true if high-impact, uncertain, or requires expert review
  "whoAffected": "Brief note on who this impacts (manufacturers, indie brands, retailers, etc.)"
}

Focus on regulatory substance: new requirements, deadline changes, banned ingredients, labeling rules, reporting criteria.
Ignore minor formatting, typo fixes, or navigation changes unless they indicate something substantive.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert regulatory analyst specializing in cosmetics law. Extract key changes clearly and concisely.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const analysis = JSON.parse(completion.choices[0].message.content || '{}');
    
    return {
      summary: analysis.summary || 'Change detected, analysis incomplete',
      tags: analysis.tags || [],
      status: analysis.status || 'unknown',
      effectiveDate: analysis.effectiveDate || null,
      needsReview: analysis.needsReview !== false // default to true
    };
  } catch (error) {
    console.error('LLM analysis error:', error);
    return {
      summary: 'Change detected. LLM analysis failed - manual review required.',
      tags: ['analysis-error'],
      status: 'unknown',
      effectiveDate: null,
      needsReview: true
    };
  }
}
