import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from '../src/api/dashboard.controller';
import { DashboardService } from '../src/api/dashboard.service';
import { SseService } from '../src/api/sse.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let dashboardServiceMock: any;
  let sseServiceMock: any;

  beforeEach(async () => {
    dashboardServiceMock = {
      getOverview: jest.fn().mockResolvedValue({ totalEpochs: 2, totalLogs: 20 }),
      getEpochs: jest.fn().mockResolvedValue([{ epochNumber: 1 }]),
      getEpochTree: jest.fn().mockResolvedValue({ epochNumber: 1, nodes: [] }),
      getProof: jest.fn().mockResolvedValue({ sequence: 5, isValid: true }),
      isDefenseLocked: jest.fn().mockResolvedValue(false),
      resetDefenseLock: jest.fn().mockResolvedValue({ success: true, message: 'Reset OK' }),
    };

    sseServiceMock = {
      getStream: jest.fn().mockReturnValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: dashboardServiceMock },
        { provide: SseService, useValue: sseServiceMock },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getOverview should delegate to service', async () => {
    const res = await controller.getOverview();
    expect(res).toEqual({ totalEpochs: 2, totalLogs: 20 });
    expect(dashboardServiceMock.getOverview).toHaveBeenCalled();
  });

  it('getEpochs should delegate to service', async () => {
    const res = await controller.getEpochs();
    expect(res).toEqual([{ epochNumber: 1 }]);
    expect(dashboardServiceMock.getEpochs).toHaveBeenCalled();
  });

  it('getEpochTree should delegate to service with parsed epochNumber', async () => {
    const res = await controller.getEpochTree(1);
    expect(res).toEqual({ epochNumber: 1, nodes: [] });
    expect(dashboardServiceMock.getEpochTree).toHaveBeenCalledWith(1);
  });

  it('getProof should delegate to service with parsed sequence', async () => {
    const res = await controller.getProof(5);
    expect(res).toEqual({ sequence: 5, isValid: true });
    expect(dashboardServiceMock.getProof).toHaveBeenCalledWith(5);
  });

  it('getSecurityStatus should return isDefenseLocked state', async () => {
    const res = await controller.getSecurityStatus();
    expect(res).toEqual({ isDefenseLocked: false });
    expect(dashboardServiceMock.isDefenseLocked).toHaveBeenCalled();
  });

  it('resetSecurityStatus should delegate to service', async () => {
    const res = await controller.resetSecurityStatus();
    expect(res).toEqual({ success: true, message: 'Reset OK' });
    expect(dashboardServiceMock.resetDefenseLock).toHaveBeenCalled();
  });
});
