import { TogglController } from './toggl.controller';
import { TogglService } from './toggl.service';

describe('TogglController', () => {
  let controller: TogglController;
  let togglService: jest.Mocked<TogglService>;

  beforeEach(() => {
    togglService = {
      findBookHours: jest.fn(),
    } as unknown as jest.Mocked<TogglService>;

    controller = new TogglController(togglService);
  });

  it('returns tracked hours for the given title', async () => {
    togglService.findBookHours.mockResolvedValueOnce(4.25);

    await expect(controller.getBookHours({ title: 'The Hobbit' })).resolves.toEqual({ hours: 4.25 });
    expect(togglService.findBookHours).toHaveBeenCalledWith('The Hobbit');
  });
});
