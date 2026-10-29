import { Injectable, OnDestroy, signal } from '@angular/core';

/** Estado de la red según navigator.onLine y los eventos online/offline. */
@Injectable({ providedIn: 'root' })
export class ConexionService implements OnDestroy {
  readonly enLinea = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  private readonly on = () => this.enLinea.set(true);
  private readonly off = () => this.enLinea.set(false);

  constructor() {
    window.addEventListener('online', this.on);
    window.addEventListener('offline', this.off);
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.on);
    window.removeEventListener('offline', this.off);
  }
}
