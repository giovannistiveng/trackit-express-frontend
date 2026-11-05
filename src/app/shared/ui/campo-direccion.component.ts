import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  OnDestroy,
  forwardRef,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Coordenadas, SugerenciaDireccion, Zona } from '../../core/domain';
import { GeoPort } from '../../core/ports';
import { IconoComponent } from './icono.component';
import { ModalComponent } from './modal.component';
import { SelectorMapaComponent } from './selector-mapa.component';
import {
  EntornoUbicacion,
  ErrorUbicacion,
  PRECISION_DUDOSA_M,
  entornoNavegador,
  obtenerUbicacion,
} from '../util/ubicacion';

/** Acceso a la geolocalización del navegador (reemplazable en pruebas). */
export const ENTORNO_UBICACION = new InjectionToken<EntornoUbicacion>('ENTORNO_UBICACION', {
  providedIn: 'root',
  factory: entornoNavegador,
});

/** Espera tras la última tecla antes de buscar (el backend limita 60 búsquedas por minuto). */
export const ESPERA_BUSQUEDA_MS = 400;

let contador = 0;

/**
 * Campo de dirección con autocompletado (OpenStreetMap a través del backend), "Usar mi ubicación"
 * y "Elegir en el mapa". El texto se enlaza como control de formulario; las coordenadas con
 * [(coords)]. Escribir a mano borra las coordenadas: solo quedan si se elige una sugerencia o un
 * punto en el mapa.
 */
@Component({
  selector: 'ti-campo-direccion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, ModalComponent, SelectorMapaComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CampoDireccionComponent),
      multi: true,
    },
  ],
  host: { class: 'block' },
  template: `
    <div class="relative">
      <input
        [id]="idCampo()"
        class="campo pr-11"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-expanded]="abierto()"
        [attr.aria-controls]="idLista"
        [attr.aria-activedescendant]="activo() >= 0 ? idLista + '-' + activo() : null"
        [attr.aria-invalid]="invalido()"
        [attr.aria-describedby]="describedBy()"
        autocomplete="off"
        maxlength="200"
        [placeholder]="placeholder()"
        [value]="texto()"
        [disabled]="deshabilitado()"
        (input)="alEscribir($any($event.target).value)"
        (keydown)="alTeclear($event)"
        (focus)="alEnfocar()"
        (blur)="alSalir()"
      />
      <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-piedra">
        @if (buscando()) {
          <ti-icono nombre="loader" class="size-5 animate-spin" />
        } @else if (coords()) {
          <ti-icono nombre="circle-check" class="size-5 text-exito" />
        } @else {
          <ti-icono nombre="search" class="size-5" />
        }
      </span>
      @if (abierto()) {
        <ul
          [id]="idLista"
          role="listbox"
          class="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-linea bg-papel py-1 shadow-[var(--shadow-elevada)]"
        >
          @for (s of sugerencias(); track s.detalle; let i = $index) {
            <li
              [id]="idLista + '-' + i"
              role="option"
              [attr.aria-selected]="i === activo()"
              class="flex cursor-pointer gap-3 px-3 py-2.5"
              [class]="i === activo() ? 'bg-marca-suave' : 'hover:bg-crema'"
              tabindex="-1"
              (mousedown)="$event.preventDefault()"
              (click)="seleccionar(s)"
              (keydown.enter)="seleccionar(s)"
            >
              <ti-icono nombre="map-pin" class="mt-0.5 size-4 shrink-0 text-marca" />
              <span class="min-w-0">
                <span class="block truncate font-semibold">{{ s.nombre }}</span>
                <span class="block truncate text-xs text-piedra">{{ s.detalle }}</span>
              </span>
            </li>
          } @empty {
            <li class="px-3 py-3 text-sm text-piedra" role="presentation">
              {{ sinResultados() }}
            </li>
          }
        </ul>
      }
    </div>
    <div class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      @if (conUbicacion()) {
        <button type="button" class="btn-texto" (click)="usarMiUbicacion()" [disabled]="ubicando()">
          <ti-icono
            [nombre]="ubicando() ? 'loader' : 'locate'"
            class="size-4"
            [class]="ubicando() ? 'animate-spin' : ''"
          />
          {{ ubicando() ? 'Ubicando…' : 'Usar mi ubicación' }}
        </button>
      }
      <button type="button" class="btn-texto" (click)="abrirMapa()">
        <ti-icono nombre="map" class="size-4" /> Elegir en el mapa
      </button>
      <span [id]="idEstado" class="text-xs" [class]="coords() ? 'text-exito' : 'text-piedra'">
        @if (coords()) {
          Ubicada en el mapa
        } @else if (texto().trim().length >= 3) {
          Elige una sugerencia o márcala en el mapa para un precio exacto
        }
      </span>
    </div>
    @if (aviso()) {
      <p
        class="mt-1 flex gap-2 rounded-lg bg-alerta-suave px-3 py-2 text-sm text-alerta"
        role="status"
      >
        <ti-icono nombre="triangle-alert" class="mt-0.5 size-4 shrink-0" />
        <span>{{ aviso() }}</span>
      </p>
    }

    @if (mapaAbierto()) {
      <ti-modal
        [titulo]="'Elige el punto: ' + etiqueta()"
        ancho="amplio"
        (cerrar)="mapaAbierto.set(false)"
      >
        @if (avisoMapa()) {
          <p class="mb-3 rounded-lg bg-aviso-suave px-3 py-2 text-sm font-medium" role="status">
            {{ avisoMapa() }}
          </p>
        }
        <p class="mb-3 text-sm text-piedra">
          Toca el mapa o arrastra el marcador hasta el lugar exacto.
          @if (zonas().length > 0) {
            Los círculos verdes son nuestras zonas de cobertura.
          }
        </p>
        <ti-selector-mapa
          [punto]="puntoMapa()"
          [zonas]="zonas()"
          (elegir)="puntoMapa.set($event)"
        />
        <div class="mt-4 flex flex-wrap justify-end gap-3">
          <button type="button" class="btn-secundario" (click)="mapaAbierto.set(false)">
            Cancelar
          </button>
          <button
            type="button"
            class="btn-primario"
            [disabled]="!puntoMapa() || ubicando()"
            (click)="usarPuntoMapa()"
          >
            <ti-icono
              [nombre]="ubicando() ? 'loader' : 'check'"
              [class]="ubicando() ? 'animate-spin' : ''"
            />
            Usar este punto
          </button>
        </div>
      </ti-modal>
    }
  `,
})
export class CampoDireccionComponent implements ControlValueAccessor, OnDestroy {
  private readonly geo = inject(GeoPort);

  readonly idCampo = input.required<string>();
  readonly etiqueta = input('dirección');
  readonly placeholder = input('Busca una dirección o lugar');
  readonly conUbicacion = input(false);
  readonly invalido = input(false);
  /** id del mensaje de error del formulario, para aria-describedby. */
  readonly idError = input<string | null>(null);
  readonly coords = model<Coordenadas | null>(null);
  /** Zonas de cobertura que se dibujan en el mapa. */
  readonly zonas = input<Zona[]>([]);

  protected readonly idLista = `direccion-lista-${++contador}`;
  protected readonly idEstado = `${this.idLista}-estado`;
  protected readonly texto = signal('');
  protected readonly sugerencias = signal<SugerenciaDireccion[]>([]);
  protected readonly abierto = signal(false);
  protected readonly activo = signal(-1);
  protected readonly buscando = signal(false);
  protected readonly ubicando = signal(false);
  protected readonly deshabilitado = signal(false);
  protected readonly aviso = signal('');
  protected readonly sinResultados = signal(
    'Sin resultados en la región. Prueba con el barrio o márcala en el mapa.',
  );
  protected readonly mapaAbierto = signal(false);
  protected readonly puntoMapa = signal<Coordenadas | null>(null);
  protected readonly avisoMapa = signal('');
  private readonly entorno = inject(ENTORNO_UBICACION);

  private alCambiar: (v: string) => void = () => undefined;
  private alTocar: () => void = () => undefined;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private consulta = 0;

  protected describedBy(): string {
    return [this.idError(), this.idEstado].filter(Boolean).join(' ');
  }

  writeValue(v: string | null): void {
    this.texto.set(v ?? '');
  }
  registerOnChange(fn: (v: string) => void): void {
    this.alCambiar = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.alTocar = fn;
  }
  setDisabledState(d: boolean): void {
    this.deshabilitado.set(d);
  }

  ngOnDestroy(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
  }

  protected alEscribir(v: string): void {
    this.texto.set(v);
    this.alCambiar(v);
    this.coords.set(null);
    this.aviso.set('');
    if (this.temporizador) clearTimeout(this.temporizador);
    if (v.trim().length < 3) {
      this.cerrar();
      return;
    }
    this.temporizador = setTimeout(() => void this.buscar(v), ESPERA_BUSQUEDA_MS);
  }

  protected alEnfocar(): void {
    if (this.sugerencias().length > 0 && !this.coords()) this.abierto.set(true);
  }

  protected alSalir(): void {
    this.alTocar();
    setTimeout(() => this.cerrar(), 120);
  }

  protected alTeclear(ev: KeyboardEvent): void {
    const n = this.sugerencias().length;
    if (ev.key === 'ArrowDown' && n > 0) {
      ev.preventDefault();
      this.abierto.set(true);
      this.activo.set((this.activo() + 1) % n);
    } else if (ev.key === 'ArrowUp' && n > 0) {
      ev.preventDefault();
      this.activo.set(this.activo() <= 0 ? n - 1 : this.activo() - 1);
    } else if (ev.key === 'Enter' && this.abierto() && this.activo() >= 0) {
      ev.preventDefault();
      this.seleccionar(this.sugerencias()[this.activo()]);
    } else if (ev.key === 'Escape' && this.abierto()) {
      ev.preventDefault();
      this.cerrar();
    }
  }

  async buscar(texto: string): Promise<void> {
    const n = ++this.consulta;
    this.buscando.set(true);
    try {
      const r = await this.geo.buscar(texto);
      if (n !== this.consulta) return;
      this.sugerencias.set(r);
      this.sinResultados.set(
        'Sin resultados en la región. Prueba con el barrio o márcala en el mapa.',
      );
    } catch {
      if (n !== this.consulta) return;
      this.sugerencias.set([]);
      this.sinResultados.set('No pudimos buscar ahora. Márcala en el mapa o sigue escribiendo.');
    } finally {
      if (n === this.consulta) {
        this.buscando.set(false);
        this.activo.set(-1);
        this.abierto.set(true);
      }
    }
  }

  seleccionar(s: SugerenciaDireccion): void {
    this.consulta++;
    this.fijar(s.nombre, s.coords);
    this.cerrar();
  }

  protected abrirMapa(): void {
    this.avisoMapa.set('');
    this.puntoMapa.set(this.coords());
    this.mapaAbierto.set(true);
  }

  async usarPuntoMapa(): Promise<void> {
    const p = this.puntoMapa();
    if (!p) return;
    await this.nombrarPunto(p);
    this.mapaAbierto.set(false);
  }

  async usarMiUbicacion(): Promise<void> {
    this.ubicando.set(true);
    this.aviso.set('');
    try {
      const pos = await obtenerUbicacion(this.entorno);
      const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      if (pos.coords.accuracy > PRECISION_DUDOSA_M) {
        // Ubicación por red (poco precisa): se abre el mapa con el punto para que lo confirme.
        this.puntoMapa.set(p);
        this.avisoMapa.set(
          `Tu ubicación es aproximada (±${Math.round(pos.coords.accuracy / 100) / 10} km). Mueve el marcador al lugar exacto.`,
        );
        this.mapaAbierto.set(true);
        return;
      }
      await this.nombrarPunto(p);
    } catch (e) {
      this.aviso.set(
        e instanceof ErrorUbicacion
          ? e.message
          : 'No pudimos obtener tu ubicación. Márcala en el mapa.',
      );
    } finally {
      this.ubicando.set(false);
    }
  }

  /** Pone nombre a un punto con la búsqueda inversa; si falla, usa las coordenadas. */
  private async nombrarPunto(p: Coordenadas): Promise<void> {
    this.ubicando.set(true);
    try {
      const r = await this.geo.inversa(p);
      this.fijar(r?.nombre || textoCoordenadas(p), p);
    } catch {
      this.fijar(this.texto().trim().length >= 3 ? this.texto() : textoCoordenadas(p), p);
    } finally {
      this.ubicando.set(false);
    }
  }

  private fijar(texto: string, c: Coordenadas): void {
    const t = texto.slice(0, 200);
    this.texto.set(t);
    this.alCambiar(t);
    this.alTocar();
    this.coords.set(c);
    this.aviso.set('');
  }

  private cerrar(): void {
    this.abierto.set(false);
    this.activo.set(-1);
  }
}

export function textoCoordenadas(p: Coordenadas): string {
  return `Punto en el mapa (${p.lat.toFixed(5)}, ${p.lon.toFixed(5)})`;
}
