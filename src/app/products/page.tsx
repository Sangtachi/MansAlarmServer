'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { useAdminSession } from '@/lib/admin';
import { ProductCategoryRow, ProductRow } from '@/lib/types';

type CategoryDraft = {
  name: string;
  slug: string;
  sortOrder: number;
  isVisible: boolean;
};

type ProductDraft = {
  categoryId: string;
  title: string;
  brand: string;
  status: ProductRow['status'];
  summary: string;
  imageUrl: string;
  sortOrder: number;
  isVisible: boolean;
};

const EMPTY_CATEGORY: CategoryDraft = {
  name: '',
  slug: '',
  sortOrder: 0,
  isVisible: true,
};

const EMPTY_PRODUCT: ProductDraft = {
  categoryId: '',
  title: '',
  brand: '',
  status: 'coming_soon',
  summary: '',
  imageUrl: '',
  sortOrder: 0,
  isVisible: true,
};

export default function ProductsPage() {
  const { supabase, state, signOut } = useAdminSession();
  const [categories, setCategories] = useState<ProductCategoryRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(EMPTY_CATEGORY);
  const [productDraft, setProductDraft] = useState<ProductDraft>(EMPTY_PRODUCT);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!supabase || state.status !== 'ready') {
      return;
    }

    const [categoryResult, productResult] = await Promise.all([
      supabase.from('product_categories').select('*').order('sort_order', { ascending: true }),
      supabase.from('products').select('*').order('sort_order', { ascending: true }),
    ]);

    if (categoryResult.error) {
      setMessage(categoryResult.error.message);
      return;
    }

    if (productResult.error) {
      setMessage(productResult.error.message);
      return;
    }

    const categoryRows = categoryResult.data ?? [];
    const productRows = productResult.data ?? [];

    setCategories(categoryRows);
    setProducts(productRows);
    setProductDraft((current) => ({
      ...current,
      categoryId: current.categoryId || categoryRows[0]?.id || '',
    }));
  }, [state.status, supabase]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAll().catch(() => undefined);
    }, 0);

    return () => clearTimeout(timer);
  }, [loadAll]);

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const resetCategory = () => {
    setEditingCategoryId(null);
    setCategoryDraft(EMPTY_CATEGORY);
  };

  const resetProduct = () => {
    setEditingProductId(null);
    setProductDraft({
      ...EMPTY_PRODUCT,
      categoryId: categories[0]?.id || '',
    });
  };

  const saveCategory = async () => {
    if (!supabase || state.status !== 'ready') {
      return;
    }

    if (!categoryDraft.name.trim() || !categoryDraft.slug.trim()) {
      setMessage('카테고리 이름과 slug를 먼저 채워야 합니다.');
      return;
    }

    setBusy(true);
    const payload = {
      name: categoryDraft.name.trim(),
      slug: categoryDraft.slug.trim(),
      sort_order: Number(categoryDraft.sortOrder) || 0,
      is_visible: categoryDraft.isVisible,
    };

    const result = editingCategoryId
      ? await supabase.from('product_categories').update(payload).eq('id', editingCategoryId)
      : await supabase.from('product_categories').insert(payload);

    setBusy(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    resetCategory();
    setMessage('카테고리를 저장했습니다.');
    await loadAll();
  };

  const saveProduct = async () => {
    if (!supabase || state.status !== 'ready') {
      return;
    }

    if (!productDraft.categoryId || !productDraft.title.trim() || !productDraft.brand.trim() || !productDraft.summary.trim()) {
      setMessage('카테고리, 상품명, 브랜드, 설명을 모두 채워야 합니다.');
      return;
    }

    setBusy(true);
    const payload = {
      category_id: productDraft.categoryId,
      title: productDraft.title.trim(),
      brand: productDraft.brand.trim(),
      status: productDraft.status,
      summary: productDraft.summary.trim(),
      image_url: productDraft.imageUrl.trim() || null,
      sort_order: Number(productDraft.sortOrder) || 0,
      is_visible: productDraft.isVisible,
    };

    const result = editingProductId
      ? await supabase.from('products').update(payload).eq('id', editingProductId)
      : await supabase.from('products').insert(payload);

    setBusy(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    resetProduct();
    setMessage('상품을 저장했습니다.');
    await loadAll();
  };

  const deleteCategory = async (id: string) => {
    if (!supabase) {
      return;
    }

    setBusy(true);
    const { error } = await supabase.from('product_categories').delete().eq('id', id);
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (editingCategoryId === id) {
      resetCategory();
    }
    setMessage('카테고리를 삭제했습니다.');
    await loadAll();
  };

  const deleteProduct = async (id: string) => {
    if (!supabase) {
      return;
    }

    setBusy(true);
    const { error } = await supabase.from('products').delete().eq('id', id);
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (editingProductId === id) {
      resetProduct();
    }
    setMessage('상품을 삭제했습니다.');
    await loadAll();
  };

  return (
    <AdminShell
      title="남자의 상품 관리"
      description="카테고리와 상품 목록을 운영하고, 준비중/후원 요청 상태를 제어합니다."
      currentPath="/products"
      sessionState={state}
      onLogout={() => signOut().catch(() => undefined)}
    >
      <div className="page-grid">
        <section className="panel panel-form">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">CATEGORY</p>
              <h3 className="panel-title">{editingCategoryId ? '카테고리 수정' : '카테고리 등록'}</h3>
            </div>
            <button type="button" className="ghost-button" onClick={resetCategory}>
              초기화
            </button>
          </div>

          <div className="field-grid">
            <label className="field-block">
              <span className="field-label">NAME</span>
              <input
                className="field-input"
                value={categoryDraft.name}
                onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>

            <label className="field-block">
              <span className="field-label">SLUG</span>
              <input
                className="field-input"
                value={categoryDraft.slug}
                onChange={(event) => setCategoryDraft((current) => ({ ...current, slug: event.target.value }))}
              />
            </label>

            <label className="field-block">
              <span className="field-label">SORT ORDER</span>
              <input
                className="field-input"
                type="number"
                value={String(categoryDraft.sortOrder)}
                onChange={(event) =>
                  setCategoryDraft((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))
                }
              />
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={categoryDraft.isVisible}
                onChange={(event) =>
                  setCategoryDraft((current) => ({ ...current, isVisible: event.target.checked }))
                }
              />
              <span>카테고리 노출</span>
            </label>
          </div>

          <button type="button" className="primary-button" onClick={saveCategory} disabled={busy}>
            {busy ? '저장 중...' : editingCategoryId ? '카테고리 갱신' : '카테고리 저장'}
          </button>

          <div className="card-list compact-list">
            {categories.map((category) => (
              <article key={category.id} className="list-card">
                <div className="list-card-top">
                  <div>
                    <p className="list-card-date">{category.slug}</p>
                    <h4 className="list-card-title">{category.name}</h4>
                  </div>
                  <span className={`status-pill ${category.is_visible ? 'status-pill-live' : ''}`}>
                    {category.is_visible ? '노출' : '숨김'}
                  </span>
                </div>
                <div className="card-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setEditingCategoryId(category.id);
                      setCategoryDraft({
                        name: category.name,
                        slug: category.slug,
                        sortOrder: category.sort_order,
                        isVisible: category.is_visible,
                      });
                    }}
                  >
                    수정
                  </button>
                  <button type="button" className="danger-button" onClick={() => deleteCategory(category.id)} disabled={busy}>
                    삭제
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel panel-form">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">PRODUCT</p>
              <h3 className="panel-title">{editingProductId ? '상품 수정' : '상품 등록'}</h3>
            </div>
            <button type="button" className="ghost-button" onClick={resetProduct}>
              초기화
            </button>
          </div>

          <div className="field-grid">
            <label className="field-block">
              <span className="field-label">CATEGORY</span>
              <select
                className="field-input"
                value={productDraft.categoryId}
                onChange={(event) => setProductDraft((current) => ({ ...current, categoryId: event.target.value }))}
              >
                <option value="">카테고리 선택</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-block">
              <span className="field-label">TITLE</span>
              <input
                className="field-input"
                value={productDraft.title}
                onChange={(event) => setProductDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>

            <label className="field-block">
              <span className="field-label">BRAND</span>
              <input
                className="field-input"
                value={productDraft.brand}
                onChange={(event) => setProductDraft((current) => ({ ...current, brand: event.target.value }))}
              />
            </label>

            <label className="field-block">
              <span className="field-label">STATUS</span>
              <select
                className="field-input"
                value={productDraft.status}
                onChange={(event) =>
                  setProductDraft((current) => ({
                    ...current,
                    status: event.target.value as ProductRow['status'],
                  }))
                }
              >
                <option value="coming_soon">준비중</option>
                <option value="support_request">후원 요청</option>
              </select>
            </label>

            <label className="field-block field-block-full">
              <span className="field-label">SUMMARY</span>
              <textarea
                className="field-textarea"
                rows={4}
                value={productDraft.summary}
                onChange={(event) => setProductDraft((current) => ({ ...current, summary: event.target.value }))}
              />
            </label>

            <label className="field-block">
              <span className="field-label">IMAGE URL</span>
              <input
                className="field-input"
                value={productDraft.imageUrl}
                onChange={(event) => setProductDraft((current) => ({ ...current, imageUrl: event.target.value }))}
              />
            </label>

            <label className="field-block">
              <span className="field-label">SORT ORDER</span>
              <input
                className="field-input"
                type="number"
                value={String(productDraft.sortOrder)}
                onChange={(event) =>
                  setProductDraft((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))
                }
              />
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={productDraft.isVisible}
                onChange={(event) =>
                  setProductDraft((current) => ({ ...current, isVisible: event.target.checked }))
                }
              />
              <span>상품 노출</span>
            </label>
          </div>

          {message ? <div className="inline-banner">{message}</div> : null}

          <button type="button" className="primary-button" onClick={saveProduct} disabled={busy}>
            {busy ? '저장 중...' : editingProductId ? '상품 갱신' : '상품 저장'}
          </button>

          <div className="card-list compact-list">
            {products.map((product) => (
              <article key={product.id} className="list-card">
                <div className="list-card-top">
                  <div>
                    <p className="list-card-date">{categoriesById.get(product.category_id)?.name ?? '미분류'}</p>
                    <h4 className="list-card-title">{product.title}</h4>
                  </div>
                  <span className={`status-pill ${product.is_visible ? 'status-pill-live' : ''}`}>
                    {product.status === 'support_request' ? '후원 요청' : '준비중'}
                  </span>
                </div>
                <p className="list-card-meta">{product.brand}</p>
                <p className="list-card-body">{product.summary}</p>
                <div className="card-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setEditingProductId(product.id);
                      setProductDraft({
                        categoryId: product.category_id,
                        title: product.title,
                        brand: product.brand,
                        status: product.status,
                        summary: product.summary,
                        imageUrl: product.image_url ?? '',
                        sortOrder: product.sort_order,
                        isVisible: product.is_visible,
                      });
                    }}
                  >
                    수정
                  </button>
                  <button type="button" className="danger-button" onClick={() => deleteProduct(product.id)} disabled={busy}>
                    삭제
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
