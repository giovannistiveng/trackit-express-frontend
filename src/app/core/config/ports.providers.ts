import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
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
  SessionStoragePort,
  ShipmentsPort,
  VehiclesPort,
  ZonesPort,
} from '../ports';
import * as http from '../adapters/http/http-adapters';
import { LocalForageAdapter, LocalStorageSessionAdapter } from '../adapters/local/browser-storage';
import { LoggerService } from '../logging/logger.service';

/** Registra el adaptador de cada puerto. */
export function providePorts(): EnvironmentProviders {
  return makeEnvironmentProviders([
    // Infraestructura del navegador
    { provide: SessionStoragePort, useExisting: LocalStorageSessionAdapter },
    { provide: KeyValueStorePort, useExisting: LocalForageAdapter },
    { provide: LoggerPort, useExisting: LoggerService },
    { provide: LogTransportPort, useExisting: http.HttpLogTransportAdapter },

    // API del backend
    { provide: AuthPort, useExisting: http.HttpAuthAdapter },
    { provide: ZonesPort, useExisting: http.HttpZonesAdapter },
    { provide: QuotePort, useExisting: http.HttpQuoteAdapter },
    { provide: ShipmentsPort, useExisting: http.HttpShipmentsAdapter },
    { provide: ClientShipmentsPort, useExisting: http.HttpClientShipmentsAdapter },
    { provide: RatingPort, useExisting: http.HttpRatingAdapter },
    { provide: DriverProfilePort, useExisting: http.HttpDriverProfileAdapter },
    { provide: VehiclesPort, useExisting: http.HttpVehiclesAdapter },
    { provide: DocumentsPort, useExisting: http.HttpDocumentsAdapter },
    { provide: DriverBoardPort, useExisting: http.HttpDriverBoardAdapter },
    { provide: DriverServicePort, useExisting: http.HttpDriverServiceAdapter },
    { provide: EvidenceStoragePort, useExisting: http.HttpEvidenceAdapter },
    { provide: DeliveryPort, useExisting: http.HttpDeliveryAdapter },
    { provide: LocationTransportPort, useExisting: http.HttpLocationAdapter },
    { provide: DriverApplicantsPort, useExisting: http.HttpDriverApplicantsAdapter },
    { provide: ApprovalPort, useExisting: http.HttpApprovalAdapter },
    { provide: AdminMetricsPort, useExisting: http.HttpAdminMetricsAdapter },
  ]);
}
