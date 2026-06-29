import type { DancerModelId } from './dancerCatalog';

const GITHUB_REPO = 'Tatsumaru2016/G-rhythm';
const GITHUB_BRANCH = 'main';

export function dancerModelUrl(id: DancerModelId, fileName: string): string {
  if (import.meta.env.DEV) {
    return `${import.meta.env.BASE_URL}models/${fileName}`;
  }
  return `https://media.githubusercontent.com/media/${GITHUB_REPO}/${GITHUB_BRANCH}/public/models/${fileName}`;
}
