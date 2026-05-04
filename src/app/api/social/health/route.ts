import { NextRequest, NextResponse } from 'next/server';

import { adminEnv, hasOllamaGeneratorEnv, hasSupabaseEnv, hasSupabaseServiceEnv } from '@/lib/env';
import { getContentGeneratorStatus } from '@/lib/contentGeneratorProvider';
import { getAdminRouteContext } from '@/lib/serverAuth';

export async function GET(request: NextRequest) {
  try {
    await getAdminRouteContext(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized' },
      { status: 401 },
    );
  }

  const generatorStatus = getContentGeneratorStatus();

  return NextResponse.json({
    health: {
      supabasePublicConfigured: hasSupabaseEnv(),
      supabaseServiceConfigured: hasSupabaseServiceEnv(),
      youtubeConfigured: Boolean(
        adminEnv.youtubeClientId
        && adminEnv.youtubeClientSecret
        && adminEnv.youtubeRefreshToken
        && adminEnv.youtubeChannelId
      ),
      instagramConfigured: Boolean(
        adminEnv.instagramAppId
        && adminEnv.instagramAppSecret
        && adminEnv.instagramAccessToken
        && adminEnv.instagramBusinessId
      ),
      workerConfigured: Boolean(adminEnv.renderWorkerUrl && adminEnv.renderWorkerSecret),
      contentGeneratorBackend: generatorStatus.backend,
      contentGeneratorConfigured: generatorStatus.backend === 'ollama' ? hasOllamaGeneratorEnv() : true,
      contentGeneratorModel: generatorStatus.model,
      contentGeneratorModelCandidates: generatorStatus.modelCandidates,
    },
  });
}
