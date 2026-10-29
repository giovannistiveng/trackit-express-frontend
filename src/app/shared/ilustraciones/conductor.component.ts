import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Conductora de TrackIt Express junto a su moto revisando un servicio en el celular. */
@Component({
  selector: 'ti-ilustracion-conductor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .moneda {
      transform-box: fill-box;
      transform-origin: center;
      animation: subir 3.2s ease-in-out infinite;
    }
    .moneda.b {
      animation-delay: 1.1s;
    }
    .moneda.c {
      animation-delay: 2.1s;
    }
    .notificacion {
      transform-box: fill-box;
      transform-origin: left center;
      animation: entrar 4s ease-in-out infinite;
    }
    @keyframes subir {
      0% {
        transform: translateY(14px);
        opacity: 0;
      }
      25%,
      70% {
        opacity: 1;
      }
      100% {
        transform: translateY(-26px);
        opacity: 0;
      }
    }
    @keyframes entrar {
      0%,
      10% {
        transform: scale(0.85);
        opacity: 0;
      }
      20%,
      85% {
        transform: scale(1);
        opacity: 1;
      }
      100% {
        transform: scale(0.95);
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .moneda,
      .notificacion {
        animation: none;
      }
    }
  `,
  template: `
    <svg viewBox="0 0 480 420" class="h-auto w-full" role="img" aria-labelledby="con-titulo">
      <title id="con-titulo">
        Una conductora con casco junto a su moto recibe un nuevo servicio en el celular
      </title>
      <circle cx="240" cy="220" r="180" fill="#ffedd5" />
      <circle cx="240" cy="220" r="130" fill="#fed7aa" opacity="0.6" />
      <ellipse cx="240" cy="380" rx="190" ry="16" fill="#1f1a17" opacity="0.08" />

      <!-- Moto -->
      <g transform="translate(150 250)">
        <circle cx="30" cy="110" r="30" fill="#1f1a17" />
        <circle cx="30" cy="110" r="12" fill="#d6d3d1" />
        <circle cx="200" cy="110" r="30" fill="#1f1a17" />
        <circle cx="200" cy="110" r="12" fill="#d6d3d1" />
        <path
          d="M30 110 L80 60 H150 L200 110"
          fill="none"
          stroke="#57534e"
          stroke-width="10"
          stroke-linecap="round"
        />
        <path d="M70 62 H170 L188 36 H158 Z" fill="#c2410c" />
        <path d="M168 36 L182 4" stroke="#1f1a17" stroke-width="8" stroke-linecap="round" />
        <path d="M176 6 h22" stroke="#1f1a17" stroke-width="8" stroke-linecap="round" />
        <rect
          x="-6"
          y="0"
          width="76"
          height="62"
          rx="8"
          fill="#c2410c"
          stroke="#9a3412"
          stroke-width="4"
        />
        <rect
          x="12"
          y="18"
          width="40"
          height="22"
          rx="4"
          fill="#f5c518"
          stroke="#1f1a17"
          stroke-width="3"
        />
        <text
          x="32"
          y="35"
          text-anchor="middle"
          font-family="Archivo, sans-serif"
          font-weight="800"
          font-size="14"
          fill="#1f1a17"
        >
          TE
        </text>
      </g>

      <!-- Conductora -->
      <g transform="translate(286 92)">
        <path
          d="M18 120 C 10 170, 14 220, 22 268 H44 C 46 220, 52 190, 56 160 L68 268 H90 C 92 210, 86 160, 78 120 Z"
          fill="#1f3a5f"
        />
        <path d="M6 70 C 10 50, 70 46, 86 70 L 92 130 H 2 Z" fill="#c2410c" />
        <path d="M24 72 L46 118 L68 72" fill="none" stroke="#fed7aa" stroke-width="4" />
        <path
          d="M86 78 C 106 90, 104 110, 86 118"
          fill="none"
          stroke="#c2410c"
          stroke-width="16"
          stroke-linecap="round"
        />
        <rect
          x="68"
          y="98"
          width="24"
          height="40"
          rx="5"
          fill="#1f1a17"
          transform="rotate(-18 80 118)"
        />
        <rect
          x="72"
          y="103"
          width="16"
          height="28"
          rx="2"
          fill="#fde68a"
          transform="rotate(-18 80 118)"
        />
        <circle cx="46" cy="36" r="24" fill="#8d5524" />
        <path d="M20 34 C 20 6, 74 4, 74 32 L 74 40 H 20 Z" fill="#c2410c" />
        <path d="M30 40 H 70 V 48 C 60 52, 40 52, 30 48 Z" fill="#1f1a17" opacity="0.85" />
        <rect x="18" y="268" width="30" height="12" rx="6" fill="#1f1a17" />
        <rect x="64" y="268" width="30" height="12" rx="6" fill="#1f1a17" />
      </g>

      <!-- Notificación de nuevo servicio -->
      <g class="notificacion" transform="translate(40 70)">
        <rect width="200" height="64" rx="16" fill="#fff" stroke="#eadfd2" />
        <circle cx="32" cy="32" r="16" fill="#ffedd5" />
        <path
          d="M24 34 l6 6 l12 -14"
          fill="none"
          stroke="#c2410c"
          stroke-width="4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <text
          x="58"
          y="28"
          font-family="Archivo, sans-serif"
          font-size="13"
          font-weight="800"
          fill="#1f1a17"
        >
          Nuevo servicio
        </text>
        <text x="58" y="46" font-family="Archivo, sans-serif" font-size="12" fill="#5c534d">
          Pekín → Casco Urbano
        </text>
      </g>

      <g font-family="Archivo, sans-serif" font-weight="800" font-size="16" fill="#1f1a17">
        <g class="moneda" transform="translate(410 150)">
          <circle r="18" fill="#f5c518" stroke="#1f1a17" stroke-width="3" />
          <text y="6" text-anchor="middle">$</text>
        </g>
        <g class="moneda b" transform="translate(440 210)">
          <circle r="14" fill="#f5c518" stroke="#1f1a17" stroke-width="3" />
          <text y="5" text-anchor="middle" font-size="13">$</text>
        </g>
        <g class="moneda c" transform="translate(395 230)">
          <circle r="12" fill="#f5c518" stroke="#1f1a17" stroke-width="3" />
          <text y="4" text-anchor="middle" font-size="11">$</text>
        </g>
      </g>
    </svg>
  `,
})
export class IlustracionConductorComponent {}
