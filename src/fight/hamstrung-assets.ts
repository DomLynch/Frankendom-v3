// Hamstrung's two clips and the victim's weapon-drop bake are fetched when the scene is going to play (the dev picker has chosen it), never as part of a
// fight's ready: the pick is picker-only, so a normal fight must not wait on ~25 KB gzip it cannot use. `load` fetches the data once; `install` puts it on one
// pair of rigs (`target`, the scene's warriors). A failed fetch or install is sticky and quiet: `ready(target)` stays false and the scene plays the plain death.
export function createHamstrungAssets<Data, Target extends object>(load: () => Promise<Data>, install: (target: Target, data: Data) => void, onError: (error: unknown) => void) {
  let data: Promise<Data> | null = null, installed: Target | null = null, failed = false;
  return {
    ready: (target: Target | null | undefined): boolean => !!target && installed === target,
    request(target: Target): Promise<void> {
      if (failed || installed === target) return Promise.resolve();
      data ??= load();
      return data.then((loaded) => { install(target, loaded); installed = target; }).catch((error: unknown) => { failed = true; onError(error); });
    },
  };
}
