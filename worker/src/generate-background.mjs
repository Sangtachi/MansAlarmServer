import { promises as fs } from 'fs';
import path from 'path';

import { config } from './config.mjs';
import { supabase } from './supabase.mjs';

// 이 모듈은 API 클라이언트를 직접 import하여 사용할 수 있도록 환경이 구성되어 있다고 가정합니다.
// ESM 환경에서 TS 파일을 임포트할 수 없다면 fetch 등으로 분리해야 하지만,
// 여기서는 worker 내에서 API를 직접 호출하거나 별도 백엔드 라우트를 찌르는 방식을 사용합니다.

// TODO: DB에 background_generation_jobs 테이블 또는 daily_contents에 status 컬럼(background_status)이
// 추가되어야 동시성 제어 및 상태 관리가 안정적입니다.
// 현재는 workflow_status = 'draft' 이고 background_asset_path 가 없는 항목을 폴링합니다.

async function generateMediaStub(prompt) {
  // 실제 mediaGeneratorClient.ts의 로직을 대체하는 워커 내부 임시 구현
  console.log('[Worker/Generator] Calling Media API for prompt:', prompt);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  // 반환값은 더미 이미지 URL
  return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png'; // 더미 이미지
}

async function uploadFileFromUrl(storagePath, fileUrl, contentType) {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch media from url: ${fileUrl}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const result = await supabase.storage.from(config.bucket).upload(storagePath, buffer, {
    upsert: true,
    contentType,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function processNextBackgroundGenerationJob() {
  // 1. 생성 대상 찾기
  // 이상적으로는 상태 컬럼(background_status = 'pending')을 조회해야 하지만,
  // 현재 스키마를 유지한 상태에서 흉내냅니다. (생성 프롬프트는 있지만 에셋이 없는 draft 콘텐츠)
  const result = await supabase
    .from('daily_contents')
    .select('id, content_date, generation_prompt_final')
    .eq('workflow_status', 'draft')
    .is('background_asset_path', null)
    .not('generation_prompt_final', 'is', null)
    .order('content_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  const content = result.data;
  if (!content) {
    return false;
  }

  console.log(`[Worker/Generator] Found content requiring background: ${content.id} (${content.content_date})`);

  try {
    // 동시 실행 방지를 위해 임시로 workflow_status를 변경하거나 락을 걸 수 있으나,
    // workflow_status를 바꾸면 기존 로직에 영향을 줄 수 있으므로 주의해야 합니다.
    // 여기서는 단순 폴링으로 처리합니다.

    // 2. 미디어 생성 (Gemini / Higgsfield)
    const prompt = content.generation_prompt_final;
    const mediaUrl = await generateMediaStub(prompt);

    // 3. 생성된 에셋을 Supabase Storage에 업로드
    const extension = 'jpg'; // 미디어 타입에 맞게 설정 (Gemini = jpg, Higgsfield = mp4)
    const contentType = 'image/jpeg';
    const storagePath = `backgrounds/${content.content_date}/${content.id}-generated.${extension}`;
    
    console.log(`[Worker/Generator] Uploading generated media to: ${storagePath}`);
    await uploadFileFromUrl(storagePath, mediaUrl, contentType);

    // 4. DB 업데이트 (background_asset_path 설정)
    const { error: updateError } = await supabase.from('daily_contents').update({
      background_asset_path: storagePath,
    }).eq('id', content.id);

    if (updateError) {
      throw updateError;
    }

    // 5. 렌더 잡 생성 (생성된 배경으로 바로 숏폼 렌더링을 시작하도록)
    // 혹은 관리자 검수가 필요하다면 여기서 멈춤.
    // 여기서는 자동으로 render_jobs 대기열에 추가합니다.
    const { error: renderJobError } = await supabase.from('render_jobs').insert({
      daily_content_id: content.id,
      status: 'pending',
      attempts: 0,
    });

    if (renderJobError) {
       console.error('[Worker/Generator] Failed to enqueue render job:', renderJobError.message);
    }

    console.log(`[Worker/Generator] Successfully generated background for ${content.id}`);

  } catch (error) {
    console.error(`[Worker/Generator] Failed to generate background for ${content.id}`, error);
    // TODO: 실패 횟수/상태 기록 (background_last_error 업데이트 등)
  }

  return true;
}
