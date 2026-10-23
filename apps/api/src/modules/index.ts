import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { OtpService } from './auth/otp.service.js';
import { BookingEngine } from './bookings/booking-engine.service.js';
import { BookingsController } from './bookings/bookings.controller.js';
import { BookingsService } from './bookings/bookings.service.js';
import { FacilitiesController } from './facilities/facilities.controller.js';
import { FacilitiesService } from './facilities/facilities.service.js';
import { CooperativesService } from './farmers/cooperatives.service.js';
import { FarmersController } from './farmers/farmers.controller.js';
import { FarmersService } from './farmers/farmers.service.js';
import { HarvestsController } from './harvests/harvests.controller.js';
import { HarvestsService } from './harvests/harvests.service.js';
import { MatchingService } from './harvests/matching.service.js';
import { OffersController } from './offers/offers.controller.js';
import { OffersService } from './offers/offers.service.js';
import { OrganisationsController } from './organisations/organisations.controller.js';
import { OrganisationsService } from './organisations/organisations.service.js';
import { SystemController } from './system/system.controller.js';
import { FleetService } from './transport/fleet.service.js';
import { QuotesService } from './transport/quotes.service.js';
import { ShipmentsService } from './transport/shipments.service.js';
import { TransportController } from './transport/transport.controller.js';

@Module({ controllers: [AuthController], providers: [AuthService, OtpService], exports: [AuthService, OtpService] })
export class AuthModule {}

@Module({ controllers: [SystemController] })
export class SystemModule {}

@Module({ imports: [AuthModule], controllers: [OrganisationsController], providers: [OrganisationsService] })
export class OrganisationsModule {}

@Module({ imports: [AuthModule], controllers: [FarmersController], providers: [FarmersService, CooperativesService] })
export class FarmersModule {}

@Module({ controllers: [FacilitiesController], providers: [FacilitiesService], exports: [FacilitiesService] })
export class FacilitiesModule {}

@Module({ providers: [BookingEngine], exports: [BookingEngine] })
export class BookingEngineModule {}

@Module({ controllers: [HarvestsController], providers: [HarvestsService, MatchingService], exports: [MatchingService] })
export class HarvestsModule {}

@Module({ imports: [BookingEngineModule], controllers: [OffersController], providers: [OffersService] })
export class OffersModule {}

@Module({ imports: [BookingEngineModule], controllers: [BookingsController], providers: [BookingsService], exports: [BookingsService] })
export class BookingsModule {}

@Module({ imports: [BookingEngineModule], controllers: [TransportController], providers: [FleetService, QuotesService, ShipmentsService] })
export class TransportModule {}

export const FEATURE_MODULES = [
  AuthModule,
  SystemModule,
  OrganisationsModule,
  FarmersModule,
  FacilitiesModule,
  HarvestsModule,
  OffersModule,
  BookingsModule,
  TransportModule,
];
