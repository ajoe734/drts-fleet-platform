import { Test, TestingModule } from '@nestjs/testing';
import { DriverInstructionService } from './driver-instruction.service';
import { DriverInstructionRepository } from './driver-instruction.repository';

describe('DriverInstructionService', () => {
  let service: DriverInstructionService;
  let repository: DriverInstructionRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverInstructionService,
        {
          provide: DriverInstructionRepository,
          useValue: {
            create: jest.fn(),
            getForDriver: jest.fn(),
            acknowledge: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DriverInstructionService>(DriverInstructionService);
    repository = module.get<DriverInstructionRepository>(DriverInstructionRepository);
  });

  it('should create an instruction', async () => {
    const mockId = '123';
    jest.spyOn(repository, 'create').mockResolvedValue(mockId);
    expect(await service.createInstruction('d1', 'msg', '2026-06-01')).toBe(mockId);
  });
});
