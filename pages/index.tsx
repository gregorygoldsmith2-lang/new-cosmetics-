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
  }[];
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
@@ -168,108 +168,111 @@ export default function Dashboard() {
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
            {changes.map((change) => {
              const primarySource = change.sources?.[0];
              return (
                <div
                  key={change.id}
                  className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {primarySource?.name}
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

                  {change.sources?.[0]?.url && (
                    <a
                      href={change.sources[0].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      View Original Source →
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
