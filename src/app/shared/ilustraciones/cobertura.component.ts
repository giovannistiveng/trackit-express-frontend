import { ChangeDetectionStrategy, Component, input } from '@angular/core';

interface Nodo {
  nombre: string;
  x: number;
  y: number;
}

/** Posiciones aproximadas (norte arriba) de las zonas alrededor de Fusagasugá. */
const NODOS: Nodo[] = [
  { nombre: 'Casco Urbano', x: 250, y: 230 },
  { nombre: 'Vereda Pekín', x: 120, y: 150 },
  { nombre: 'Vereda Novillero', x: 380, y: 330 },
  { nombre: 'Silvania', x: 400, y: 110 },
  { nombre: 'Pasca', x: 110, y: 350 },
];

/** Mapa esquemático de la cobertura: el casco urbano conectado con veredas y municipios vecinos. */
@Component({
  selector: 'ti-ilustracion-cobertura',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .onda {
      transform-box: fill-box;
      transform-origin: center;
      animation: onda 2.6s ease-out infinite;
    }
    .enlace {
      stroke-dasharray: 6 8;
      animation: fluir 1.6s linear infinite;
    }
    @keyframes onda {
      from {
        transform: scale(0.6);
        opacity: 0.7;
      }
      to {
        transform: scale(2.4);
        opacity: 0;
      }
    }
    @keyframes fluir {
      to {
        stroke-dashoffset: -28;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .onda,
      .enlace {
        animation: none;
      }
    }
  `,
  template: `
    <svg viewBox="0 0 500 460" class="h-auto w-full" role="img" aria-labelledby="cob-titulo">
      <title id="cob-titulo">
        Mapa de cobertura: casco urbano de Fusagasugá conectado con {{ nombres() }}
      </title>
      <defs>
        <pattern id="grilla" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0H0V28" fill="none" stroke="#e7dccf" stroke-width="1" />
        </pattern>
      </defs>
      <rect x="6" y="6" width="488" height="448" rx="32" fill="#fffaf5" stroke="#eadfd2" />
      <rect x="6" y="6" width="488" height="448" rx="32" fill="url(#grilla)" />
      <path
        d="M40 420 C 120 380, 160 300, 240 300 S 380 220, 470 180"
        fill="none"
        stroke="#bfdbfe"
        stroke-width="10"
        stroke-linecap="round"
        opacity="0.8"
      />
      <path
        d="M60 80 C 120 120, 160 90, 220 120"
        fill="none"
        stroke="#cfe2d8"
        stroke-width="26"
        stroke-linecap="round"
        opacity="0.7"
      />
      @for (n of nodos.slice(1); track n.nombre) {
        <line
          class="enlace"
          [attr.x1]="nodos[0].x"
          [attr.y1]="nodos[0].y"
          [attr.x2]="n.x"
          [attr.y2]="n.y"
          stroke="#c2410c"
          stroke-width="3"
          stroke-linecap="round"
        />
      }
      @for (n of nodos; track n.nombre; let primero = $first) {
        <g [attr.transform]="'translate(' + n.x + ' ' + n.y + ')'">
          @if (primero) {
            <circle class="onda" r="22" fill="#c2410c" />
          }
          <circle
            [attr.r]="primero ? 22 : 13"
            [attr.fill]="primero ? '#c2410c' : '#fff'"
            stroke="#c2410c"
            stroke-width="4"
          />
          @if (primero) {
            <circle r="7" fill="#f5c518" stroke="#1f1a17" stroke-width="2" />
          }
          <g [attr.transform]="'translate(0 ' + (primero ? 44 : 34) + ')'">
            <rect
              [attr.x]="-n.nombre.length * 4.1 - 10"
              y="-14"
              [attr.width]="n.nombre.length * 8.2 + 20"
              height="26"
              rx="13"
              fill="#1f1a17"
            />
            <text
              text-anchor="middle"
              y="4"
              fill="#fff"
              font-size="13"
              font-weight="700"
              font-family="Archivo, sans-serif"
            >
              {{ n.nombre }}
            </text>
          </g>
        </g>
      }
      <g
        transform="translate(446 60)"
        fill="#5c534d"
        font-family="Archivo, sans-serif"
        font-size="12"
        font-weight="700"
      >
        <path d="M0 -18 L7 4 L0 0 L-7 4Z" fill="#1f1a17" />
        <text y="20" text-anchor="middle">N</text>
      </g>
    </svg>
  `,
})
export class IlustracionCoberturaComponent {
  readonly zonas = input<string[]>([]);
  protected readonly nodos = NODOS;
  protected nombres(): string {
    return NODOS.slice(1)
      .map((n) => n.nombre)
      .join(', ');
  }
}
