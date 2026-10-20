import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ClientInfo, IClientInfo } from '../common/client-info.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @ClientInfo() clientInfo: IClientInfo
  ) {
    return this.authService.login(dto, clientInfo);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: LogoutDto,
    @ClientInfo() clientInfo: IClientInfo
  ) {
    return this.authService.logout(dto, clientInfo);
  }
}
