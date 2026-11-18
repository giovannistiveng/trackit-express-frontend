import { Injectable, OnDestroy, signal } from '@angular/core';

/** Estado de la red según navigator.onLine y los eventos online/offline. */
@Injectable({ providedIn: 'root' })
export class ConexionService implements OnDestroy {
  readonly enLinea = signal(navigator.onLine);
  private readonly on = () => this.enLinea.set(true);
  private readonly off = () => this.enLinea.set(false);

  constructor() {
    globalThis.addEventListener('online', this.on);
    globalThis.addEventListener('offline', this.off);
  }

  ngOnDestroy(): void {
    globalThis.removeEventListener('online', this.on);
    globalThis.removeEventListener('offline', this.off);
  }
}
