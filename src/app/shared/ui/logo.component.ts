import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Marca de TrackIt Express: un pin con la ruta dentro de un cuadro naranja, y el nombre. */
@Component({
  selector: 'ti-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2.5' },
  template: `
    <svg viewBox="0 0 40 40" class="size-9 shrink-0" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="#c2410c" />
      <path
        d="M9 29c5-1 7-5 11-5s6 3 11 1"
        fill="none"
        stroke="#fed7aa"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-dasharray="1 4.5"
      />
      <path
        d="M20 7.5c-4.4 0-7.7 3.3-7.7 7.5 0 5.6 7.7 12 7.7 12s7.7-6.4 7.7-12c0-4.2-3.3-7.5-7.7-7.5Z"
        fill="#fff"
      />
      <circle cx="20" cy="15" r="3.1" fill="#f5c518" stroke="#1f1a17" stroke-width="1.4" />
    </svg>
    @if (conNombre()) {
      <span class="leading-none" [class.text-white]="claro()">
        <span class="block text-[1.05rem] font-extrabold tracking-tight" style="font-stretch: 115%"
          >TrackIt</span
        >
        <span
          class="block text-[0.62rem] font-bold tracking-[0.3em]"
          [class.text-marca]="!claro()"
          [class.text-white]="claro()"
          >EXPRESS</span
        >
      </span>
    }
  `,
})
export class LogoComponent {
  readonly conNombre = input(true);
  /** Texto blanco, para fondos oscuros o naranja. */
  readonly claro = input(false);
}
