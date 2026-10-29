import {
  EnvironmentProviders,
  Provider,
  Type,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import {
  AdminMetricsPort,
  ApprovalPort,
  AuthPort,
  ClientShipmentsPort,
  DeliveryPort,
  DocumentsPort,
  DriverApplicantsPort,
  DriverBoardPort,
  DriverProfilePort,
  DriverServicePort,
  EvidenceStoragePort,
  KeyValueStorePort,
  LocationTransportPort,
  LogTransportPort,
  LoggerPort,
  QuotePort,
  RatingPort,
  RouteStartPort,
  SessionStoragePort,
  ShipmentsPort,
  VehiclesPort,
  ZonesPort,
} from '../ports';
import * as http from '../adapters/http/http-adapters';
import * as mock from '../adapters/mock/mock-adapters';
import * as local from '../adapters/local/local-adapters';
import { LocalForageAdapter, LocalStorageSessionAdapter } from '../adapters/local/browser-storage';
import { LoggerService } from '../logging/logger.service';
import { APP_CONFIG, FeatureName } from './app-config';

/** Provee el adaptador real si el flag está encendido, y el alternativo si no. */
export function porFlag<T>(
  puerto: abstract new (...args: never[]) => T,
  flag: FeatureName,
  real: Type<T>,
  alternativo: Type<T>,
): Provider {
  return {
    provide: puerto,
    useFactory: () => (inject(APP_CONFIG).features[flag] ? inject(real) : inject(alternativo)),
  };
}

/** Brecha 7: endpoint propio → Cloudinary (si está configurado) → URL simulada. */
function evidencia(): Provider {
  return {
    provide: EvidenceStoragePort,
    useFactory: () => {
      const cfg = inject(APP_CONFIG);
      if (cfg.features.evidenciaUpload) return inject(http.HttpEvidenceAdapter);
      if (cfg.cloudinary.cloudName && cfg.cloudinary.uploadPreset)
        return inject(http.CloudinaryEvidenceAdapter);
      return inject(mock.MockEvidenceAdapter);
    },
  };
}

export function providePorts(): EnvironmentProviders {
  return makeEnvironmentProviders([
    // Infraestructura del navegador
    { provide: SessionStoragePort, useExisting: LocalStorageSessionAdapter },
    { provide: KeyValueStorePort, useExisting: LocalForageAdapter },
    { provide: LoggerPort, useExisting: LoggerService },
    { provide: LogTransportPort, useExisting: http.HttpLogTransportAdapter },

    // Endpoints que ya existen
    { provide: AuthPort, useExisting: http.HttpAuthAdapter },
    { provide: QuotePort, useExisting: http.HttpQuoteAdapter },
    { provide: ShipmentsPort, useExisting: http.HttpShipmentsAdapter },
    { provide: DriverServicePort, useExisting: http.HttpDriverServiceAdapter },
    { provide: VehiclesPort, useExisting: http.HttpVehiclesAdapter },
    { provide: DocumentsPort, useExisting: http.HttpDocumentsAdapter },
    { provide: DeliveryPort, useExisting: http.HttpDeliveryAdapter },
    { provide: RatingPort, useExisting: http.HttpRatingAdapter },
    { provide: ApprovalPort, useExisting: http.HttpApprovalAdapter },

    // Brechas del backend (ver docs/brechas-backend.md)
    porFlag(
      DriverProfilePort,
      'conductorMe',
      http.HttpDriverProfileAdapter,
      local.DemoDriverProfileAdapter,
    ),
    porFlag(ZonesPort, 'zonasEndpoint', http.HttpZonesAdapter, local.SeededZonesAdapter),
    porFlag(
      ClientShipmentsPort,
      'clienteEnviosEndpoint',
      http.HttpClientShipmentsAdapter,
      local.LocalShipmentsCache,
    ),
    porFlag(
      DriverBoardPort,
      'disponiblesEndpoint',
      http.HttpDriverBoardAdapter,
      local.ProbeDriverBoardAdapter,
    ),
    porFlag(
      RouteStartPort,
      'iniciarRutaEndpoint',
      http.HttpRouteStartAdapter,
      mock.MockRouteStartAdapter,
    ),
    porFlag(
      DriverApplicantsPort,
      'pendientesEndpoint',
      http.HttpDriverApplicantsAdapter,
      mock.MockDriverApplicantsAdapter,
    ),
    evidencia(),
    porFlag(LocationTransportPort, 'ubicacion', http.HttpLocationAdapter, mock.MockLocationAdapter),
    porFlag(
      AdminMetricsPort,
      'adminDashboard',
      http.HttpAdminMetricsAdapter,
      mock.MockAdminMetricsAdapter,
    ),
  ]);
}
