import { Injectable } from '@angular/core';
import localforage from 'localforage';
import { KeyValueStorePort, SessionStoragePort } from '../../ports';

@Injectable({ providedIn: 'root' })
export class LocalStorageSessionAdapter implements SessionStoragePort {
  leer(clave: string): string | null {
    try {
      return localStorage.getItem(clave);
    } catch {
      return null;
    }
  }
  guardar(clave: string, valor: string): void {
    try {
      localStorage.setItem(clave, valor);
    } catch {
      /* almacenamiento lleno o bloqueado: la sesión vive solo en memoria */
    }
  }
  borrar(clave: string): void {
    try {
      localStorage.removeItem(clave);
    } catch {
      /* ignorado */
    }
  }
}

@Injectable({ providedIn: 'root' })
export class LocalForageAdapter implements KeyValueStorePort {
  private db: Pick<LocalForage, 'getItem' | 'setItem' | 'removeItem'> = localforage.createInstance({
    name: 'trackit',
    storeName: 'trackit',
  });

  get<T>(clave: string): Promise<T | null> {
    return this.db.getItem<T>(clave);
  }
  async set<T>(clave: string, valor: T): Promise<void> {
    await this.db.setItem(clave, valor);
  }
  remove(clave: string): Promise<void> {
    return this.db.removeItem(clave);
  }
}
