import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Ilustración principal: montañas del Sumapaz, el pueblo y una moto de TrackIt Express
 * que recorre la carretera hasta el pin de destino. La moto se anima con offset-path.
 */
@Component({
  selector: 'ti-ilustracion-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    .nube {
      animation: deriva 26s linear infinite;
    }
    .nube.lenta {
      animation-duration: 38s;
    }
    .pin {
      transform-box: fill-box;
      transform-origin: 50% 100%;
      animation: saltar 2.4s ease-in-out infinite;
    }
    .moto {
      offset-path: path(
        'M60 452 C 150 430, 170 380, 250 372 S 380 360, 420 318 S 470 250, 520 236'
      );
      offset-rotate: auto;
      animation: recorrer 9s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
    }
    .rueda {
      transform-box: fill-box;
      transform-origin: center;
      animation: girar 0.6s linear infinite;
    }
    .linea-carretera {
      stroke-dasharray: 12 12;
      animation: trazo 1.4s linear infinite;
    }
    @keyframes deriva {
      from {
        transform: translateX(-60px);
      }
      to {
        transform: translateX(700px);
      }
    }
    @keyframes saltar {
      0%,
      100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-8px);
      }
    }
    @keyframes recorrer {
      0% {
        offset-distance: 0%;
        opacity: 0;
      }
      6% {
        opacity: 1;
      }
      88% {
        offset-distance: 100%;
        opacity: 1;
      }
      100% {
        offset-distance: 100%;
        opacity: 0;
      }
    }
    @keyframes girar {
      to {
        transform: rotate(360deg);
      }
    }
    @keyframes trazo {
      to {
        stroke-dashoffset: -48;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .nube,
      .pin,
      .rueda,
      .linea-carretera {
        animation: none;
      }
      .moto {
        animation: none;
        offset-distance: 55%;
      }
    }
  `,
  template: `
    <svg viewBox="0 0 640 520" class="h-auto w-full" role="img" aria-labelledby="hero-titulo">
      <title id="hero-titulo">
        Un mensajero de TrackIt Express en moto recorre la carretera entre las montañas hasta el
        punto de entrega
      </title>
      <defs>
        <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffedd5" />
          <stop offset="1" stop-color="#fff7ed" />
        </linearGradient>
        <linearGradient id="montana-lejana" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#a7c9b8" />
          <stop offset="1" stop-color="#cfe2d8" />
        </linearGradient>
        <linearGradient id="montana-media" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#5f9a7e" />
          <stop offset="1" stop-color="#7fb398" />
        </linearGradient>
        <linearGradient id="colina" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3a7a61" />
          <stop offset="1" stop-color="#2f6b55" />
        </linearGradient>
        <clipPath id="marco"><rect width="640" height="520" rx="36" /></clipPath>
      </defs>

      <g clip-path="url(#marco)">
        <rect width="640" height="520" fill="url(#cielo)" />
        <circle cx="488" cy="128" r="62" fill="#fdba74" opacity="0.55" />
        <circle cx="488" cy="128" r="38" fill="#fb923c" opacity="0.5" />

        <g class="nube" fill="#fff" opacity="0.9">
          <ellipse cx="80" cy="92" rx="46" ry="14" />
          <ellipse cx="108" cy="82" rx="28" ry="16" />
        </g>
        <g class="nube lenta" fill="#fff" opacity="0.75">
          <ellipse cx="300" cy="60" rx="38" ry="11" />
          <ellipse cx="322" cy="52" rx="22" ry="13" />
        </g>

        <path
          d="M0 300 L90 196 L150 250 L240 150 L330 238 L420 170 L520 248 L600 190 L640 220 V520 H0Z"
          fill="url(#montana-lejana)"
        />
        <path d="M240 150 L266 175 L252 172 L240 186 L226 170 Z" fill="#fff" opacity="0.8" />
        <path
          d="M0 360 L120 262 L210 320 L320 236 L430 312 L520 260 L640 330 V520 H0Z"
          fill="url(#montana-media)"
        />
        <path
          d="M0 420 C 120 360, 230 380, 330 340 S 520 280, 640 300 V520 H0Z"
          fill="url(#colina)"
        />

        <!-- Pueblo -->
        <g transform="translate(470 196)">
          <rect x="0" y="22" width="34" height="26" fill="#fff7ed" />
          <path d="M-4 24 L17 6 L38 24Z" fill="#c2410c" />
          <rect x="12" y="34" width="10" height="14" fill="#9a3412" />
          <rect x="42" y="30" width="28" height="20" fill="#ffedd5" />
          <path d="M38 32 L56 17 L74 32Z" fill="#9a3412" />
          <rect x="76" y="14" width="18" height="36" fill="#fff" />
          <path d="M73 16 L85 2 L97 16Z" fill="#c2410c" />
          <rect x="82" y="22" width="6" height="8" fill="#f5c518" />
        </g>
        <g fill="#24543f">
          <path d="M40 410 l14 -38 l14 38Z" />
          <path d="M70 402 l11 -30 l11 30Z" />
          <path d="M590 300 l12 -32 l12 32Z" />
          <path d="M560 312 l10 -26 l10 26Z" />
        </g>

        <!-- Carretera -->
        <path
          d="M60 452 C 150 430, 170 380, 250 372 S 380 360, 420 318 S 470 250, 520 236"
          fill="none"
          stroke="#3b332e"
          stroke-width="26"
          stroke-linecap="round"
        />
        <path
          class="linea-carretera"
          d="M60 452 C 150 430, 170 380, 250 372 S 380 360, 420 318 S 470 250, 520 236"
          fill="none"
          stroke="#fde68a"
          stroke-width="3"
          stroke-linecap="round"
        />

        <!-- Pin de origen -->
        <g class="pin" transform="translate(44 382)">
          <path
            d="M16 0C7 0 0 7 0 15.5 0 27 16 40 16 40s16-13 16-24.5C32 7 25 0 16 0Z"
            fill="#1f1a17"
          />
          <circle cx="16" cy="15" r="6" fill="#fff" />
        </g>
        <!-- Pin de destino -->
        <g class="pin" style="animation-delay: 0.6s" transform="translate(512 168)">
          <path
            d="M20 0C9 0 0 9 0 19.5 0 34 20 50 20 50s20-16 20-30.5C40 9 31 0 20 0Z"
            fill="#c2410c"
          />
          <circle cx="20" cy="19" r="8" fill="#f5c518" stroke="#1f1a17" stroke-width="2" />
        </g>

        <!-- Moto con el mensajero -->
        <g class="moto">
          <g transform="translate(-34 -46)">
            <circle class="rueda" cx="14" cy="40" r="10" fill="#1f1a17" />
            <circle cx="14" cy="40" r="4" fill="#d6d3d1" />
            <circle class="rueda" cx="56" cy="40" r="10" fill="#1f1a17" />
            <circle cx="56" cy="40" r="4" fill="#d6d3d1" />
            <path
              d="M14 40 L28 26 L46 26 L56 40"
              fill="none"
              stroke="#57534e"
              stroke-width="4"
              stroke-linecap="round"
            />
            <path d="M24 26 h26 l6 -8 h-8 Z" fill="#c2410c" />
            <rect
              x="2"
              y="8"
              width="24"
              height="18"
              rx="3"
              fill="#c2410c"
              stroke="#9a3412"
              stroke-width="2"
            />
            <rect x="8" y="13" width="12" height="7" rx="1.5" fill="#f5c518" />
            <path d="M36 26 L40 8" stroke="#1f1a17" stroke-width="7" stroke-linecap="round" />
            <path d="M40 10 L52 18" stroke="#1f1a17" stroke-width="5" stroke-linecap="round" />
            <circle cx="40" cy="2" r="7" fill="#c2410c" />
            <path d="M42 -1 h6 v5 h-6Z" fill="#1f1a17" opacity="0.8" />
          </g>
        </g>
      </g>
    </svg>
  `,
})
export class IlustracionHeroComponent {}
