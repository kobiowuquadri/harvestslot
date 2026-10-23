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
import { ReceivingController } from './receiving/receiving.controller.js';
import { ReceivingService } from './receiving/receiving.service.js';
import { FinanceController } from './finance/finance.controller.js';
import { FinanceService } from './finance/finance.service.js';
import { DisputesController } from './disputes/disputes.controller.js';
import { DisputesService } from './disputes/disputes.service.js';
import { UploadsController } from './uploads/uploads.controller.js';
import { UploadsService } from './uploads/uploads.service.js';
import { NotificationsController, NotificationsService } from './notifications/notifications.controller.js';
import { AdminController, AnalyticsController, PrivacyController } from './admin/admin.controller.js';
import { AdminService } from './admin/admin.service.js';
import { AnalyticsService } from './analytics/analytics.service.js';

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

@Module({ imports: [BookingEngineModule], controllers: [ReceivingController], providers: [ReceivingService] })
export class ReceivingModule {}

@Module({ controllers: [FinanceController], providers: [FinanceService], exports: [FinanceService] })
export class FinanceModule {}

@Module({ imports: [BookingEngineModule], controllers: [DisputesController], providers: [DisputesService] })
export class DisputesModule {}

@Module({ controllers: [UploadsController], providers: [UploadsService], exports: [UploadsService] })
export class UploadsModule {}

@Module({ controllers: [NotificationsController], providers: [NotificationsService] })
export class NotificationsModule {}

@Module({ controllers: [AdminController, AnalyticsController, PrivacyController], providers: [AdminService, AnalyticsService] })
export class AdminModule {}

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
  ReceivingModule,
  FinanceModule,
  DisputesModule,
  UploadsModule,
  NotificationsModule,
  AdminModule,
];
