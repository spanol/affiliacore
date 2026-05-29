import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DateRangePicker from './DateRangePicker';
import { getPresetRange, type DateRange } from '../lib/dateRange';

const VALUE: DateRange = { startDate: '2026-05-01', endDate: '2026-05-29' };

describe('DateRangePicker', () => {
  it('mostra o rótulo do intervalo atual', () => {
    render(<DateRangePicker value={VALUE} onChange={() => {}} />);
    expect(screen.getByText('01/05/2026 – 29/05/2026')).toBeInTheDocument();
  });

  it('abre o dropdown com os presets ao clicar', async () => {
    const user = userEvent.setup();
    render(<DateRangePicker value={VALUE} onChange={() => {}} />);

    expect(screen.queryByText('Mês passado')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button'));

    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.getByText('Últimos 7 dias')).toBeInTheDocument();
    expect(screen.getByText('Mês passado')).toBeInTheDocument();
  });

  it('emite o intervalo do preset selecionado', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateRangePicker value={VALUE} onChange={onChange} />);

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Últimos 7 dias'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(getPresetRange('last7'));
  });

  it('aplica um intervalo personalizado pelos campos de data', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<DateRangePicker value={VALUE} onChange={onChange} />);

    await user.click(screen.getByRole('button'));

    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    fireEvent.change(dateInputs[0], { target: { value: '2026-03-10' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-03-20' } });

    await user.click(screen.getByText('Aplicar intervalo'));

    expect(onChange).toHaveBeenCalledWith({ startDate: '2026-03-10', endDate: '2026-03-20' });
  });

  it('normaliza quando início > fim (inverte)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<DateRangePicker value={VALUE} onChange={onChange} />);

    await user.click(screen.getByRole('button'));
    const dateInputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2026-03-20' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-03-10' } });
    await user.click(screen.getByText('Aplicar intervalo'));

    expect(onChange).toHaveBeenCalledWith({ startDate: '2026-03-10', endDate: '2026-03-20' });
  });
});
