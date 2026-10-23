import { Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  changePasswordSchema,
  claimCompleteSchema,
  claimStartSchema,
  demoLoginSchema,
  forgotPasswordSchema,
  loginResultSchema,
  loginSchema,
  meSchema,
  mfaCodeSchema,
  mfaEnableResultSchema,
  mfaSetupResultSchema,
  otpSchema,
  phoneRecoveryCompleteSchema,
  phoneRecoveryStartSchema,
  registerSchema,
  resetPasswordSchema,
  updateAccountSchema,
  verifyEmailSchema,
} from '@harvestslot/contracts';
import { DomainError, type Actor } from '@harvestslot/core';
import { issueCsrfToken, verifyCsrfToken } from '../../common/crypto.js';
import { AllowMfaPending, byActor, byBodyField, byIp, CurrentActor, Public, RateLimit, Req } from '../../common/decorators.js';
import { CSRF_COOKIE, type AppRequest, type AppResponse } from '../../common/http.js';
import { SessionService } from '../../common/sessions.service.js';
import { ENV, type Env } from '../../common/tokens.js';
import { ApiOk, ZodBody } from '../../common/zod.js';
import { AuthService } from './auth.service.js';
import { OtpService } from './otp.service.js';

const GENERIC_RECOVERY = { message: 'If an account matches, we have sent instructions to its email or phone.' };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Issues (or re-issues) the CSRF cookie bound to the current session. Call once on app start. */
  @Public()
  @Get('csrf')
  csrf(@Req() req: AppRequest, @Res({ passthrough: true }) res: AppResponse) {
    const key = req.sessionCtx?.id ?? 'anon';
    const existing = req.cookies?.[CSRF_COOKIE] as string | undefined;
    const token = existing && verifyCsrfToken(this.env.SESSION_SECRET, key, existing) ? existing : issueCsrfToken(this.env.SESSION_SECRET, key);
    res.cookie(CSRF_COOKIE, token, this.sessions.csrfCookieOptions());
    return { csrfToken: token };
  }

  @Public()
  @Post('register')
  @RateLimit({ name: 'register-ip', limit: 10, windowSec: 3600, key: byIp })
  @ApiOk(meSchema)
  register(@Req() req: AppRequest, @Res({ passthrough: true }) res: AppResponse, @ZodBody(registerSchema) body: z.infer<typeof registerSchema>) {
    return this.auth.register(req, res, body);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit(
    { name: 'login-ip', limit: 30, windowSec: 900, key: byIp },
    { name: 'login-identifier', limit: 10, windowSec: 900, key: byBodyField('identifier') },
  )
  @ApiOk(loginResultSchema)
  login(@Req() req: AppRequest, @Res({ passthrough: true }) res: AppResponse, @ZodBody(loginSchema) body: z.infer<typeof loginSchema>) {
    return this.auth.login(req, res, body.identifier, body.password);
  }

  @AllowMfaPending()
  @Post('mfa/verify')
  @HttpCode(200)
  @RateLimit({ name: 'mfa-verify', limit: 8, windowSec: 900, key: byActor })
  async verifyMfa(@CurrentActor() actor: Actor, @Req() req: AppRequest, @ZodBody(mfaCodeSchema) body: z.infer<typeof mfaCodeSchema>) {
    await this.auth.verifyMfa(actor, req.sessionCtx!.id, body.code);
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: AppResponse) {
    await this.auth.logout(res, req.sessionCtx?.id);
    return { ok: true };
  }

  @AllowMfaPending()
  @Get('me')
  @ApiOk(meSchema)
  me(@CurrentActor() actor: Actor, @Req() req: AppRequest) {
    return this.auth.me(actor.userId, req.sessionCtx!.id);
  }

  @Public()
  @Post('demo-login')
  @HttpCode(200)
  @RateLimit({ name: 'demo-login', limit: 60, windowSec: 600, key: byIp })
  async demoLogin(@Req() req: AppRequest, @Res({ passthrough: true }) res: AppResponse, @ZodBody(demoLoginSchema) body: z.infer<typeof demoLoginSchema>) {
    if (req.sessionCtx) await this.sessions.revoke(req.sessionCtx.id, 'demo role switch');
    await this.auth.demoLogin(req, res, body.persona);
    return { ok: true };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @RateLimit({ name: 'verify-email', limit: 20, windowSec: 900, key: byIp })
  async verifyEmail(@ZodBody(verifyEmailSchema) body: z.infer<typeof verifyEmailSchema>) {
    await this.auth.verifyEmail(body.token);
    return { ok: true };
  }

  @Post('verify-email/resend')
  @HttpCode(200)
  @RateLimit({ name: 'verify-email-resend', limit: 3, windowSec: 900, key: byActor })
  async resend(@CurrentActor() actor: Actor) {
    await this.auth.resendEmailVerification(actor);
    return { ok: true };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @RateLimit(
    { name: 'forgot-ip', limit: 10, windowSec: 3600, key: byIp },
    { name: 'forgot-identifier', limit: 3, windowSec: 3600, key: byBodyField('identifier') },
  )
  async forgot(@ZodBody(forgotPasswordSchema) body: z.infer<typeof forgotPasswordSchema>) {
    await this.auth.forgotPassword(body.identifier);
    return GENERIC_RECOVERY;
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @RateLimit({ name: 'reset-ip', limit: 20, windowSec: 3600, key: byIp })
  async reset(@ZodBody(resetPasswordSchema) body: z.infer<typeof resetPasswordSchema>) {
    await this.auth.resetPassword(body.token, body.newPassword);
    return { ok: true };
  }

  @Public()
  @Post('phone-recovery/start')
  @HttpCode(200)
  @RateLimit({ name: 'phone-recovery-ip', limit: 10, windowSec: 3600, key: byIp }, { name: 'phone-recovery-phone', limit: 3, windowSec: 3600, key: byBodyField('phone') })
  async phoneRecoveryStart(@ZodBody(phoneRecoveryStartSchema) body: z.infer<typeof phoneRecoveryStartSchema>) {
    await this.auth.forgotPassword(body.phone);
    return GENERIC_RECOVERY;
  }

  @Public()
  @Post('phone-recovery/complete')
  @HttpCode(200)
  @RateLimit({ name: 'phone-recovery-complete', limit: 10, windowSec: 3600, key: byIp })
  async phoneRecoveryComplete(@ZodBody(phoneRecoveryCompleteSchema) body: z.infer<typeof phoneRecoveryCompleteSchema>) {
    await this.auth.phoneRecoveryComplete(body.phone, body.code, body.newPassword);
    return { ok: true };
  }

  @Post('phone/send-code')
  @HttpCode(200)
  @RateLimit({ name: 'phone-code', limit: 5, windowSec: 3600, key: byActor })
  async sendPhoneCode(@CurrentActor() actor: Actor) {
    await this.auth.sendPhoneVerification(actor);
    return { ok: true };
  }

  @Post('phone/verify')
  @HttpCode(200)
  @RateLimit({ name: 'phone-verify', limit: 10, windowSec: 900, key: byActor })
  async verifyPhone(@CurrentActor() actor: Actor, @ZodBody(otpSchema) body: z.infer<typeof otpSchema>) {
    await this.auth.verifyPhone(actor, body.code);
    return { ok: true };
  }

  @Get('sessions')
  sessionsList(@CurrentActor() actor: Actor, @Req() req: AppRequest) {
    return this.auth.listSessions(actor, req.sessionCtx!.id);
  }

  @Delete('sessions/:id')
  async revokeSession(@CurrentActor() actor: Actor, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.auth.revokeSession(actor, id);
    return { ok: true };
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  async revokeOthers(@CurrentActor() actor: Actor, @Req() req: AppRequest) {
    const revoked = await this.sessions.revokeAllForUser(actor.userId, 'signed out elsewhere', req.sessionCtx!.id);
    return { revoked };
  }

  @Post('password/change')
  @HttpCode(200)
  @RateLimit({ name: 'password-change', limit: 10, windowSec: 3600, key: byActor })
  async changePassword(@CurrentActor() actor: Actor, @Req() req: AppRequest, @ZodBody(changePasswordSchema) body: z.infer<typeof changePasswordSchema>) {
    await this.auth.changePassword(actor, req.sessionCtx!.id, body);
    return { ok: true };
  }

  @Patch('account')
  async updateAccount(@CurrentActor() actor: Actor, @Req() req: AppRequest, @ZodBody(updateAccountSchema) body: z.infer<typeof updateAccountSchema>) {
    await this.auth.updateAccount(actor, body);
    return this.auth.me(actor.userId, req.sessionCtx!.id);
  }

  @Post('mfa/setup')
  @HttpCode(200)
  @ApiOk(mfaSetupResultSchema)
  mfaSetup(@CurrentActor() actor: Actor) {
    return this.auth.mfaSetup(actor);
  }

  @Post('mfa/enable')
  @HttpCode(200)
  @RateLimit({ name: 'mfa-enable', limit: 10, windowSec: 900, key: byActor })
  @ApiOk(mfaEnableResultSchema)
  mfaEnable(@CurrentActor() actor: Actor, @Req() req: AppRequest, @ZodBody(otpSchema) body: z.infer<typeof otpSchema>) {
    return this.auth.mfaEnable(actor, req.sessionCtx!.id, body.code);
  }

  @Post('mfa/disable')
  @HttpCode(200)
  @RateLimit({ name: 'mfa-disable', limit: 10, windowSec: 900, key: byActor })
  async mfaDisable(@CurrentActor() actor: Actor, @ZodBody(otpSchema) body: z.infer<typeof otpSchema>) {
    await this.auth.mfaDisable(actor, body.code);
    return { ok: true };
  }

  @Post('invitations/accept')
  @HttpCode(200)
  async acceptInvitation(@CurrentActor() actor: Actor, @ZodBody(verifyEmailSchema) body: z.infer<typeof verifyEmailSchema>) {
    await this.auth.acceptInvitation(actor, body.token);
    return { ok: true };
  }

  @Public()
  @Post('claim/start')
  @HttpCode(200)
  @RateLimit({ name: 'claim-ip', limit: 10, windowSec: 3600, key: byIp })
  claimStart(@ZodBody(claimStartSchema) body: z.infer<typeof claimStartSchema>) {
    if (!this.otp.smsAvailable) throw new DomainError('INTEGRATION_NOT_CONFIGURED', 'Account claiming needs SMS verification, which is not configured');
    return this.auth.claimStart(body.claimCode);
  }

  @Public()
  @Post('claim/complete')
  @HttpCode(200)
  @RateLimit({ name: 'claim-complete-ip', limit: 10, windowSec: 3600, key: byIp })
  async claimComplete(@Req() req: AppRequest, @Res({ passthrough: true }) res: AppResponse, @ZodBody(claimCompleteSchema) body: z.infer<typeof claimCompleteSchema>) {
    await this.auth.claimComplete(req, res, body);
    return { ok: true };
  }
}
