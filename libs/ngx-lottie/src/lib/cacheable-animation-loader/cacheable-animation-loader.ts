import { Injectable, OnDestroy } from '@angular/core';
import { filter, map, switchMap } from 'rxjs/operators';

import { AnimationLoader } from '../animation-loader';
import { AnimationItem, AnimationConfigWithData, AnimationConfigWithPath } from '../symbols';
import { Subject, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CacheableAnimationLoader extends AnimationLoader implements OnDestroy {
  private cache = new Map<string, { inFlight?: Subject<void>; animationData?: any }>();

  ngOnDestroy(): void {
    this.cache.clear();
  }

  loadAnimation(options: AnimationConfigWithData | AnimationConfigWithPath) {
    return this.player$.pipe(
      switchMap(player => {
        if (this.isAnimationConfigWithPath(options)) {
          console.log('is path');
          if (this.cache.has(options.path)) {
            if (this.cache.get(options.path)!.animationData) {
              console.log('cache hit - has data');
              return of({ player, animationData: this.cache.get(options.path)!.animationData });
            } else {
              console.log('cache hit - inflight');
              return this.cache.get(options.path!)!.inFlight!.pipe(
                map(animationData => {
                  console.log('inflight complete');
                  return { player, animationData };
                }),
              );
            }
          } else {
            console.log('cache miss - fetching');
            this.cache.set(options.path!, { inFlight: new Subject() });
            return fetch(options.path!)
              .then(res => res.json())
              .then(animationData => {
                console.log('cache miss - fetch complete');
                this.cache.get(options.path!)!.inFlight!.next(animationData);
                this.cache.get(options.path!)!.inFlight!.complete();
                return { player, animationData };
              });
          }
        } else {
          return of({ player, animationData: (options as AnimationConfigWithData).animationData });
        }
      }),
      filter(({ animationData }) => !!animationData),
      map(({ player, animationData }) => {
        const animationItem = this.createAnimationItem(
          player,
          this.transformOptions(options, animationData),
        );
        // this.awaitConfigAndCache(options, animationItem);
        console.log('animation item created');
        return animationItem;
      }),
    );
  }

  // private awaitConfigAndCache(
  //   options: AnimationConfigWithData | AnimationConfigWithPath,
  //   animationItem: AnimationItem,
  // ): void {
  //   if (this.isAnimationConfigWithPath(options)) {
  //     // Don't wait for the `config_ready` event if it has been cached previously.
  //     if (this.cache.has(options.path!)) {
  //       return;
  //     }
  //     console.log('x');

  //     this.inFlight.add(options.path);

  //     animationItem.addEventListener('config_ready', () => {
  //       // See the comments below on why we're storing the animation data as a string.
  //       this.cache.set(options.path!, JSON.stringify(animationItem['animationData']));
  //     });
  //   }
  // }

  private transformOptions(
    options: AnimationConfigWithData | AnimationConfigWithPath,
    animationData?: any,
  ): AnimationConfigWithData | AnimationConfigWithPath {
    if (this.isAnimationConfigWithPath(options) && this.cache.has(options.path!)) {
      return {
        ...options,
        path: undefined,
        // Caretaker note: `lottie-web` cannot re-use the `animationData` object between animations, and we
        // have to retrieve a new object each time an animation is created.
        // https://github.com/airbnb/lottie-web#html
        // See comments for the `animationData` property.
        animationData,
      };
    } else {
      return options;
    }
  }

  private isAnimationConfigWithPath(
    options: Record<string, unknown>,
  ): options is ForceAnimationConfigWithPath {
    return typeof options.path === 'string';
  }
}

type ForceAnimationConfigWithPath = Omit<AnimationConfigWithPath, 'path'> & {
  path: string;
};
