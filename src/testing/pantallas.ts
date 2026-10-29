import { EnvironmentProviders, Provider, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Usuario } from '../app/core/domain';
import { SessionService } from '../app/core/auth/session.service';
import { AppEnvironment } from '../environments/environment.model';
import { jwtVigente } from './fixtures';
import { provideFakesBase } from './fakes';

export interface OpcionesPantalla {
  providers?: (Provider | EnvironmentProviders)[];
  usuario?: Usuario | null;
  config?: AppEnvironment;
  inputs?: Record<string, unknown>;
}

/** Monta una pantalla con dobles, sesión iniciada y router de prueba. */
export async function montar<T>(componente: Type<T>, o: OpcionesPantalla = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideFakesBase(o.config),
      provideRouter([{ path: '**', children: [] }]),
      ...(o.providers ?? []),
    ],
  });
  if (o.usuario) TestBed.inject(SessionService).iniciar(o.usuario, jwtVigente());
  const router = TestBed.inject(Router);
  const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const navegarUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture: ComponentFixture<T> = TestBed.createComponent(componente);
  for (const [k, v] of Object.entries(o.inputs ?? {})) fixture.componentRef.setInput(k, v);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    el,
    c: fixture.componentInstance,
    navegar,
    navegarUrl,
    estable: async () => {
      for (let i = 0; i < 3; i++) await fixture.whenStable();
    },
  };
}

/** Configura dobles y sesión sin montar ningún componente (para servicios). */
export function configurar(o: Omit<OpcionesPantalla, 'inputs'> = {}): void {
  TestBed.configureTestingModule({
    providers: [provideFakesBase(o.config), provideRouter([]), ...(o.providers ?? [])],
  });
  if (o.usuario) TestBed.inject(SessionService).iniciar(o.usuario, jwtVigente());
}
