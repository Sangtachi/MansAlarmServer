import { adminEnv } from './env';

export type MediaGenerationResult = {
  url: string;
  type: 'image' | 'video';
};

/**
 * Gemini API를 사용하여 프롬프트 기반 이미지를 생성합니다.
 */
export async function generateImageWithGemini(prompt: string): Promise<string> {
  // TODO: 실제 Gemini API 연동 구현
  // 현재는 임시 스텁 반환
  console.log('[Gemini] Generating image for prompt:', prompt);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return 'https://example.com/dummy-gemini-image.jpg';
}

/**
 * Higgsfield API를 사용하여 이미지를 비디오로 애니메이팅 하거나 텍스트에서 비디오를 생성합니다.
 */
export async function generateVideoWithHiggsfield(prompt: string, imageUrl?: string): Promise<string> {
  // TODO: 실제 Higgsfield API 연동 구현
  // 현재는 임시 스텁 반환
  console.log('[Higgsfield] Generating video for prompt:', prompt, 'with image:', imageUrl);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return 'https://example.com/dummy-higgsfield-video.mp4';
}

/**
 * 통합 배경 생성 함수
 */
export async function generateBackgroundMedia(prompt: string): Promise<MediaGenerationResult> {
  // 우선 Gemini로 이미지를 생성하고 (T2I)
  const imageUrl = await generateImageWithGemini(prompt);
  
  // (선택 사항) 해당 이미지를 바탕으로 Higgsfield에서 영상을 생성할 수 있습니다. (I2V)
  // 현재는 주석 처리해 두고, 이미지 URL만 반환하도록 설정합니다.
  /*
  const videoUrl = await generateVideoWithHiggsfield(prompt, imageUrl);
  return { url: videoUrl, type: 'video' };
  */
  
  return { url: imageUrl, type: 'image' };
}
