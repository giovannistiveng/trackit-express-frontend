import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { botonPorTexto, provideFakesBase, q } from '../../testing/fakes';
import { CopPipe, formatearCop } from './pipes/cop.pipe';
import { FechaLocalPipe, formatearFechaLocal } from './pipes/fecha-local.pipe';
import { CargaArchivoComponent } from './ui/carga-archivo.component';
import { EstadoBadgeComponent } from './ui/estado-badge.component';
import { EstadoCargaComponent, FaseCarga } from './ui/estado-carga.component';
import { EstrellasComponent } from './ui/estrellas.component';
import { ModalComponent } from './ui/modal.component';
import { PlacaComponent } from './ui/placa.component';
import { TecladoPinComponent } from './ui/teclado-pin.component';
import { ToastService, ToastsComponent } from './ui/toast.service';
import { aCsv, descargarArchivo } from './util/csv';
import { mostrarError } from './ui/campo-error';
import { FormControl, Validators } from '@angular/forms';

const nbsp = (s: string) => s.replace(/\s/g, ' ');

describe('pipes', () => {
  it('cop formatea pesos sin decimales', () => {
    expect(nbsp(new CopPipe().transform(39500))).toBe('$ 39.500');
    expect(formatearCop(null)).toBe('');
    expect(formatearCop(Number.NaN)).toBe('');
  });

  it('fechaLocal muestra la fecha UTC en hora local con el formato d MMM y, h:mm a', () => {
    const texto = nbsp(new FechaLocalPipe().transform('2026-10-29T07:03:31.748Z'));
    expect(texto).toMatch(/^\d{1,2} \w{3} 2026, \d{1,2}:\d{2} [ap]\. ?m\.$/);
    expect(formatearFechaLocal(null)).toBe('');
    expect(formatearFechaLocal('no es fecha')).toBe('');
    expect(formatearFechaLocal(new Date('2026-01-05T15:00:00Z'))).toContain('2026');
  });
});

describe('ToastService y ToastsComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('debería mostrar avisos en una región aria-live y cerrarlos solos', async () => {
    vi.useFakeTimers();
    const f = TestBed.createComponent(ToastsComponent);
    const s = TestBed.inject(ToastService);
    s.exito('Guardado');
    s.error('Falló');
    f.detectChanges();
    const region = q(f.nativeElement, '[aria-live="polite"]');
    expect(region.textContent).toContain('Guardado');
    expect(region.textContent).toContain('Falló');
    vi.advanceTimersByTime(5001);
    expect(s.toasts().map((t) => t.texto)).toEqual(['Falló']);
    botonPorTexto(f.nativeElement, '✕').click();
    expect(s.toasts()).toEqual([]);
  });
});

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  template: `<button id="origen">abrir</button>
    @if (abierto()) {
      <ti-modal titulo="Prueba" [cerrable]="cerrable()" (cerrar)="cerrados.set(cerrados() + 1)"
        ><button id="a">A</button><button id="b">B</button></ti-modal
      >
    }`,
})
class HostModal {
  abierto = signal(true);
  cerrable = signal(true);
  cerrados = signal(0);
}

describe('ModalComponent', () => {
  it('debería enfocar el primer elemento, atrapar el foco y cerrar con Escape', async () => {
    const f = TestBed.createComponent(HostModal);
    document.body.appendChild(f.nativeElement);
    await f.whenStable();
    const dialog = q(f.nativeElement, '[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(q(f.nativeElement, `#${dialog.getAttribute('aria-labelledby')}`).textContent).toBe(
      'Prueba',
    );
    const botones = dialog.querySelectorAll('button');
    expect(document.activeElement).toBe(botones[0]);
    (botones[botones.length - 1] as HTMLElement).focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.activeElement).toBe(botones[0]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    expect(document.activeElement).toBe(botones[botones.length - 1]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(f.componentInstance.cerrados()).toBe(1);
    q(f.nativeElement, 'ti-modal').click();
    expect(f.componentInstance.cerrados()).toBe(2);
    f.nativeElement.remove();
  });

  it('no debería cerrarse con Escape si no es cerrable', async () => {
    const f = TestBed.createComponent(HostModal);
    f.componentInstance.cerrable.set(false);
    await f.whenStable();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(f.componentInstance.cerrados()).toBe(0);
  });
});

describe('EstrellasComponent', () => {
  it('debería exponer un radiogroup y moverse con las flechas', async () => {
    const f = TestBed.createComponent(EstrellasComponent);
    await f.whenStable();
    const radios = f.nativeElement.querySelectorAll(
      '[role="radio"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(radios).toHaveLength(5);
    expect(q(f.nativeElement, '[role="radiogroup"]').getAttribute('aria-label')).toBe(
      'Calificación',
    );
    radios[2].click();
    await f.whenStable();
    expect(f.componentInstance.valor()).toBe(3);
    expect(radios[2].getAttribute('aria-checked')).toBe('true');
    radios[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(f.componentInstance.valor()).toBe(4);
    radios[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    radios[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(f.componentInstance.valor()).toBe(1);
    radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(f.componentInstance.valor()).toBe(5);
    radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(f.componentInstance.valor()).toBe(5);
  });
});

describe('TecladoPinComponent', () => {
  it('debería aceptar solo dígitos, máximo 4, y permitir borrar', async () => {
    const f = TestBed.createComponent(TecladoPinComponent);
    await f.whenStable();
    const c = f.componentInstance;
    for (const d of ['1', '2', 'a', '3', '4', '5']) c.agregar(d);
    expect(c.valor()).toBe('1234');
    await f.whenStable();
    expect(botonPorTexto(f.nativeElement, '5').disabled).toBe(true);
    c.borrar();
    expect(c.valor()).toBe('123');
    const grupo = q(f.nativeElement, '[role="group"]');
    grupo.dispatchEvent(new KeyboardEvent('keydown', { key: '9' }));
    expect(c.valor()).toBe('1239');
    grupo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
    expect(c.valor()).toBe('123');
    botonPorTexto(f.nativeElement, 'Limpiar').click();
    expect(c.valor()).toBe('');
    await f.whenStable();
    botonPorTexto(f.nativeElement, '7').click();
    expect(c.valor()).toBe('7');
    expect(f.nativeElement.textContent).not.toContain('7•');
  });

  it('no debería escribir deshabilitado', async () => {
    const f = TestBed.createComponent(TecladoPinComponent);
    f.componentRef.setInput('deshabilitado', true);
    f.componentInstance.agregar('1');
    expect(f.componentInstance.valor()).toBe('');
  });
});

describe('CargaArchivoComponent', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:previa');
    URL.revokeObjectURL = vi.fn();
  });

  it('debería rechazar en el cliente un tipo no permitido o un archivo de más de 5 MB', async () => {
    const f = TestBed.createComponent(CargaArchivoComponent);
    const rechazos: string[] = [];
    const emitidos: File[] = [];
    f.componentInstance.rechazado.subscribe((r) => rechazos.push(r));
    f.componentInstance.archivo.subscribe((a) => emitidos.push(a));
    await f.componentInstance.procesar(new File(['x'], 'a.txt', { type: 'text/plain' }));
    // Un PDF pesado no se puede comprimir: se rechaza por tamaño
    const grande = new File(['x'], 'g.pdf', { type: 'application/pdf' });
    Object.defineProperty(grande, 'size', { value: 6 * 1024 * 1024 });
    await f.componentInstance.procesar(grande);
    await f.componentInstance.procesar(null);
    await f.whenStable();
    expect(rechazos).toEqual(['tipo', 'tamano', 'vacio']);
    expect(emitidos).toEqual([]);
    expect(q(f.nativeElement, '[role="alert"]').textContent).toContain('Elige un archivo');
  });

  it('debería emitir un JPG válido con vista previa y un PDF sin vista previa', async () => {
    const f = TestBed.createComponent(CargaArchivoComponent);
    const emitidos: File[] = [];
    f.componentInstance.archivo.subscribe((a) => emitidos.push(a));
    await f.componentInstance.procesar(new File(['x'], 'cedula.jpg', { type: 'image/jpeg' }));
    await f.whenStable();
    expect(q<HTMLImageElement>(f.nativeElement, 'img').src).toBe('blob:previa');
    await f.componentInstance.procesar(new File(['x'], 'soat.pdf', { type: 'application/pdf' }));
    await f.whenStable();
    expect(f.nativeElement.querySelector('img')).toBeNull();
    expect(f.nativeElement.textContent).toContain('soat.pdf');
    expect(emitidos.map((e) => e.name)).toEqual(['cedula.jpg', 'soat.pdf']);
    f.componentInstance.reiniciar();
    await f.whenStable();
    expect(f.nativeElement.textContent).toContain('Elige o arrastra un archivo');
  });

  it('debería procesar archivos soltados y desde el input', async () => {
    const f = TestBed.createComponent(CargaArchivoComponent);
    f.componentRef.setInput('capturar', true);
    await f.whenStable();
    const emitidos: File[] = [];
    f.componentInstance.archivo.subscribe((a) => emitidos.push(a));
    const archivo = new File(['x'], 'foto.png', { type: 'image/png' });
    const label = q(f.nativeElement, 'label');
    label.dispatchEvent(new Event('dragover'));
    const drop = new Event('drop') as Event & { dataTransfer: unknown };
    drop.dataTransfer = { files: [archivo] };
    label.dispatchEvent(drop);
    const input = q<HTMLInputElement>(f.nativeElement, 'input[type=file]');
    expect(input.getAttribute('capture')).toBe('environment');
    Object.defineProperty(input, 'files', { value: [archivo] });
    input.dispatchEvent(new Event('change'));
    label.dispatchEvent(new Event('dragleave'));
    await vi.waitFor(() => expect(emitidos).toHaveLength(2));
  });
});

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstadoCargaComponent],
  template: `<ti-estado-carga
    [fase]="fase()"
    textoVacio="Nada"
    textoError="Falló"
    (reintentar)="reintentos.set(reintentos() + 1)"
    ><p id="datos">Datos</p></ti-estado-carga
  >`,
})
class HostCarga {
  fase = signal<FaseCarga>('cargando');
  reintentos = signal(0);
}

describe('EstadoCargaComponent', () => {
  it('debería mostrar los cuatro estados', async () => {
    const f = TestBed.createComponent(HostCarga);
    const el = f.nativeElement as HTMLElement;
    await f.whenStable();
    expect(q(el, '[role="status"]').textContent).toContain('Cargando');
    f.componentInstance.fase.set('vacio');
    await f.whenStable();
    expect(el.textContent).toContain('Nada');
    f.componentInstance.fase.set('error');
    await f.whenStable();
    expect(q(el, '[role="alert"]').textContent).toContain('Falló');
    botonPorTexto(el, 'Reintentar').click();
    expect(f.componentInstance.reintentos()).toBe(1);
    f.componentInstance.fase.set('listo');
    await f.whenStable();
    expect(q(el, '#datos').textContent).toBe('Datos');
  });
});

describe('PlacaComponent y EstadoBadgeComponent', () => {
  it('la placa se anuncia dígito por dígito', async () => {
    const f = TestBed.createComponent(PlacaComponent);
    f.componentRef.setInput('valor', '4821');
    f.componentRef.setInput('etiqueta', 'PIN');
    f.componentRef.setInput('pie', 'PIN DE ENTREGA');
    f.componentRef.setInput('tamano', 'grande');
    await f.whenStable();
    expect(q(f.nativeElement, '[role="img"]').getAttribute('aria-label')).toBe('PIN: 4 8 2 1');
  });

  it('la insignia muestra el estado', async () => {
    const f = TestBed.createComponent(EstadoBadgeComponent);
    f.componentRef.setInput('estado', 'En Ruta');
    await f.whenStable();
    expect(f.nativeElement.textContent).toContain('En Ruta');
  });
});

describe('csv y campo-error', () => {
  it('debería escapar comas y comillas e incluir BOM', () => {
    expect(aCsv(['a', 'b'], [['x,y', 'di "hola"']])).toBe('﻿a,b\r\n"x,y","di ""hola"""');
  });

  it('debería descargar un archivo', () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    descargarArchivo('a.csv', 'x');
    expect(click).toHaveBeenCalled();
  });

  it('mostrarError solo tras interacción', () => {
    const c = new FormControl('', Validators.required);
    expect(mostrarError(c)).toBe(false);
    c.markAsTouched();
    expect(mostrarError(c)).toBe(true);
    expect(mostrarError(null)).toBe(false);
  });
});

describe('proveedores base', () => {
  it('se pueden instanciar', () => {
    TestBed.configureTestingModule({ providers: [provideFakesBase()] });
    expect(TestBed.inject(ToastService)).toBeTruthy();
  });
});
