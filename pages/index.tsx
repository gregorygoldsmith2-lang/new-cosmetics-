// pages/index.tsx
// Copy this ENTIRE file into GitHub at: pages/index.tsx

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface ChangeEvent {
  id: string;
  detected_at: string;
  change_summary: string;
  tags: string[];
  status: string;
  effective_date: string | null;
  needs_review: boolean;
  reviewed_at: string | null;
  snapshot_after_id: string;
  sources: {
    name: string;
    url: string;
  };
}

interface Source {
  id: string;
  name: string;
}

export default function Dashboard() {
  const [changes, setChanges] = useState<ChangeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSource, setFilterSource] = useState('all');
  const [filterReview, setFilterReview] = useState('all');
  const [sources, setSources] = useState<Source[]>([]);

  useEffect(() => {
    fetchSources();
    fetchChanges();
  }, [filterSource, filterReview]);

  async function fetchSources() {
    const { data } = await supabase
      .from('sources')
      .select('id, name')
      .eq('is_active', true);
    setSources(data || []);
  }

  async function fetchChanges() {
    setLoading(true);
    let query = supabase
      .from('change_events')
      .select(`
        id,
        detected_at,
        change_summary,
        tags,
        status,
        effective_date,
        needs_review,
        reviewed_at,
        snapshot_after_id,
        sources (name, url)
      `)
      .order('detected_at', { ascending: false })
      .limit(50);

    if (filterSource !== 'all') {
      query = query.eq('source_id', filterSource);
    }

    if (filterReview === 'pending') {
      query = query.eq('needs_review', true).is('reviewed_at', null);
    } else if (filterReview === 'reviewed') {
      query = query.not('reviewed_at', 'is', null);
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching changes:', error);
    } else {
      setChanges(data || []);
    }
    setLoading(false);
  }

  async function markReviewed(changeId: string) {
    const { error } = await supabase
      .from('change_events')
      .update({ 
        needs_review: false,
        reviewed_at: new Date().toISOString() 
      })
      .eq('id', changeId);

    if (!error) {
      fetchChanges();
    }
  }

  async function viewSnapshot(snapshotId: string) {
    const { data } = await supabase
      .from('snapshots')
      .select('raw_html, fetched_at')
      .eq('id', snapshotId)
      .single();

    if (data) {
      const blob = new Blob([data.raw_html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Cosmetics Regulatory Monitor
          </h1>
          <p className="text-gray-600">
            Tracking changes to FDA and state cosmetics regulations
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Source
              </label>
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="all">All Sources</option>
                {sources.map(source => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Review Status
              </label>
              <select
                value={filterReview}
                onChange={(e) => setFilterReview(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="all">All Changes</option>
                <option value="pending">Needs Review</option>
                <option value="reviewed">Reviewed</option>
              </select>
            </div>

            <div className="pt-7">
              <button
                onClick={fetchChanges}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Changes List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="text-gray-500">Loading changes...</div>
          </div>
        ) : changes.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-500">No changes detected yet.</div>
            <div className="text-sm text-gray-400 mt-2">
              The system will check sources daily at 9 AM PT
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {changes.map((change) => (
              <div
                key={change.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {change.sources?.name}
                      </h3>
                      {change.needs_review && !change.reviewed_at && (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                          Needs Review
                        </span>
                      )}
                      {change.status && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                          {change.status}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 mb-3">
                      Detected: {new Date(change.detected_at).toLocaleString()}
                      {change.effective_date && (
                        <span className="ml-3">
                          Effective: {new Date(change.effective_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {change.needs_review && !change.reviewed_at && (
                      <button
                        onClick={() => markReviewed(change.id)}
                        className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                      >
                        Mark Reviewed
                      </button>
                    )}
                    <button
                      onClick={() => viewSnapshot(change.snapshot_after_id)}
                      className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                    >
                      View Source
                    </button>
                  </div>
                </div>

                <p className="text-gray-700 mb-3">{change.change_summary}</p>

                {change.tags && change.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {change.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {change.sources?.url && (
                  <a
                    href={change.sources.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    View Original Source →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
