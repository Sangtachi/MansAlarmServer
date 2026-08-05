'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { useAdminSession } from '@/lib/admin';

type CommunityPostRow = {
  id: string;
  author_name: string;
  title: string;
  content: string;
  is_proof: boolean;
  likes_count: number;
  created_at: string;
};

type PostDraft = {
  authorName: string;
  title: string;
  content: string;
  isProof: boolean;
  likesCount: number;
};

const ITEMS_PER_PAGE = 3;

function getInitialDraft(): PostDraft {
  return {
    authorName: '관리자',
    title: '',
    content: '',
    isProof: true,
    likesCount: 0,
  };
}

export default function CommunityAdminPage() {
  const { supabase, state, signOut } = useAdminSession();
  const [rows, setRows] = useState<CommunityPostRow[]>([]);
  const [draft, setDraft] = useState<PostDraft>(getInitialDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!supabase || state.status !== 'ready') return;
    try {
      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Mock fallback if table doesn't exist yet
        setRows([
          {
            id: 'post-1',
            author_name: '강철의의지',
            title: '오늘 06:30 알람 1초만에 깼습니다!!',
            content: '타자 미션 치면서 잠 다 깼네요. 오늘 하루도 다들 갓생 사세요 👊',
            is_proof: true,
            likes_count: 12,
            created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
          },
          {
            id: 'post-2',
            author_name: '오운완러',
            title: '아침 운동 하시는 분들 루틴 공유 부탁드립니다',
            content: '알람 끄고 바로 공복 유산소 30분 뛰고 있는데 보충제 언제 드시나요?',
            is_proof: false,
            likes_count: 7,
            created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
          },
        ]);
        return;
      }
      setRows(data ?? []);
    } catch {
      // Mock fallback
    }
  }, [state.status, supabase]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const resetDraft = () => {
    setDraft(getInitialDraft());
    setEditingId(null);
    setDeleteConfirmId(null);
  };

  const handleEdit = (row: CommunityPostRow) => {
    setEditingId(row.id);
    setDraft({
      authorName: row.author_name,
      title: row.title,
      content: row.content,
      isProof: row.is_proof,
      likesCount: row.likes_count,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || !draft.content.trim()) {
      setMessage('제목과 내용을 모두 입력해 주세요.');
      return;
    }

    setBusy(true);
    setMessage(null);

    const payload = {
      author_name: draft.authorName.trim() || '익명 맨즈',
      title: draft.title.trim(),
      content: draft.content.trim(),
      is_proof: draft.isProof,
      likes_count: draft.likesCount,
    };

    try {
      if (supabase && state.status === 'ready') {
        if (editingId) {
          await supabase.from('community_posts').update(payload).eq('id', editingId);
        } else {
          await supabase.from('community_posts').insert(payload);
        }
      }

      // Optimistic state update for instant UI response
      if (editingId) {
        setRows((prev) =>
          prev.map((r) => (r.id === editingId ? { ...r, ...payload } : r))
        );
        setMessage('게시글이 수정되었습니다.');
      } else {
        const newPost: CommunityPostRow = {
          id: `post-${Date.now()}`,
          ...payload,
          created_at: new Date().toISOString(),
        };
        setRows((prev) => [newPost, ...prev]);
        setMessage('새 게시글이 등록되었습니다.');
      }

      resetDraft();
      await loadRows();
    } catch (error: any) {
      setMessage(error?.message || '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    setMessage(null);
    // Optimistic UI update
    setRows((prev) => prev.filter((r) => r.id !== id));

    try {
      if (supabase && state.status === 'ready') {
        await supabase.from('community_posts').delete().eq('id', id);
      }
      setMessage('게시글이 삭제되었습니다.');
    } catch {
      await loadRows();
    } finally {
      setBusy(false);
      setDeleteConfirmId(null);
    }
  };

  const totalPages = Math.ceil(rows.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = rows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const isAdmin = state.status === 'ready';

  return (
    <AdminShell
      title={isAdmin ? "커뮤니티 관리 (맨즈 클럽)" : "맨즈 클럽 커뮤니티 (일반 회원 모드)"}
      description={isAdmin ? "앱 내 맨즈 클럽 게시판(알람 미션 성공 인증 & 자유 피드) 게시글을 추가, 수정, 삭제하는 관리자 메뉴입니다." : "갓생 아침 알람 성공 인증 피드와 남성 커뮤니티 글을 자유롭게 둘러보실 수 있습니다."}
      currentPath="/community"
      sessionState={state}
      onLogout={() => void signOut()}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Form Column */}
        <section className="lg:col-span-5 border border-zinc-800 bg-zinc-950 p-6 rounded-2xl">
          <div className="mb-6 border-b border-zinc-800 pb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
                {isAdmin ? 'MANS CLUB ADMIN' : 'MANS CLUB MEMBER'}
              </p>
              <h3 className="text-xl font-bold text-white">
                {editingId ? '게시글 수정' : isAdmin ? '새 게시글 / 공지 등록' : '커뮤니티 글쓰기'}
              </h3>
            </div>
            {editingId && (
              <button type="button" className="text-xs text-zinc-400 hover:text-white" onClick={resetDraft}>
                취소
              </button>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">작성자 닉네임</label>
              <input
                type="text"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-zinc-500"
                value={draft.authorName}
                onChange={(e) => setDraft({ ...draft, authorName: e.target.value })}
                placeholder="예: 일반회원 / 강철의의지"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">글 제목</label>
              <input
                type="text"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-zinc-500"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="제목을 입력하세요"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">글 내용</label>
              <textarea
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-zinc-500 resize-none"
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                placeholder="게시글 상세 내용을 입력해 주세요"
              />
            </div>

            <div className="flex items-center gap-6 py-2">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.isProof}
                  onChange={(e) => setDraft({ ...draft, isProof: e.target.checked })}
                  className="rounded border-zinc-700 bg-zinc-900"
                />
                🏆 알람 미션 성공 인증 피드로 분류
              </label>
            </div>

            {editingId && isAdmin && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">리스펙트 (좋아요) 수</label>
                <input
                  type="number"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-zinc-500"
                  value={draft.likesCount}
                  onChange={(e) => setDraft({ ...draft, likesCount: Number(e.target.value) })}
                />
              </div>
            )}

            {message && (
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-amber-400">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-4 bg-white text-black font-bold text-sm rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-all"
            >
              {editingId ? '수정 내용 즉시 반영' : '게시글 등록하기'}
            </button>
          </form>
        </section>

        {/* Right List Column */}
        <section className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="text-lg font-bold text-white">커뮤니티 피드 (최근순)</h3>
            <span className="text-xs text-zinc-500">
              PAGE {currentPage}/{totalPages} ({rows.length}건)
            </span>
          </div>

          <div className="space-y-3">
            {paginatedRows.map((row) => (
              <div
                key={row.id}
                className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors relative"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{row.author_name}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      row.is_proof ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' : 'bg-orange-950 text-orange-400 border border-orange-800/50'
                    }`}>
                      {row.is_proof ? '🏆 인증 피드' : '🔥 자유 피드'}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                </div>

                <h4 className="text-base font-bold text-white mb-1">{row.title}</h4>
                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-4">{row.content}</p>

                <div className="flex items-center justify-between border-t border-zinc-900 pt-3">
                  <span className="text-xs text-zinc-500">👍 리스펙트: <strong className="text-white">{row.likes_count}</strong></span>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(row)}
                        className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 rounded-lg hover:text-white"
                      >
                        수정
                      </button>
                      {deleteConfirmId === row.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDelete(row.id)}
                            className="px-3 py-1.5 bg-red-950 border border-red-800 text-xs font-bold text-red-300 rounded-lg"
                          >
                            삭제확인
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-1.5 text-xs text-zinc-500"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(row.id)}
                          className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-xs font-bold text-red-400 rounded-lg hover:bg-red-950"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <button
                type="button"
                className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 rounded-xl disabled:opacity-30"
                disabled={currentPage === 1 || busy}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                이전 페이지
              </button>
              <span className="text-xs text-zinc-500">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 rounded-xl disabled:opacity-30"
                disabled={currentPage === totalPages || busy}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                다음 페이지
              </button>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
