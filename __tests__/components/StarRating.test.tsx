import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { StarRating } from '@/components/ui';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('lucide-react-native', () => ({
  Star: () => null,
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StarRating', () => {
  it('renders 5 star buttons', () => {
    const { getAllByRole } = render(
      <StarRating value={null} average={0} count={0} onRate={jest.fn()} />,
    );
    expect(getAllByRole('button')).toHaveLength(5);
  });

  it('marks the chosen star as selected', () => {
    const { getByLabelText } = render(
      <StarRating value={3} average={3} count={1} onRate={jest.fn()} />,
    );
    expect(getByLabelText('Valorar con 3 estrellas').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('Valorar con 2 estrellas').props.accessibilityState.selected).toBe(false);
    expect(getByLabelText('Valorar con 4 estrellas').props.accessibilityState.selected).toBe(false);
  });

  it('calls onRate with the pressed star number', () => {
    const onRate = jest.fn();
    const { getByLabelText } = render(
      <StarRating value={null} average={0} count={0} onRate={onRate} />,
    );
    fireEvent.press(getByLabelText('Valorar con 4 estrellas'));
    expect(onRate).toHaveBeenCalledWith(4);
  });

  it('shows the average and a pluralised count', () => {
    const { getByText } = render(
      <StarRating value={2} average={3.75} count={8} onRate={jest.fn()} />,
    );
    expect(getByText('3.8 · 8 valoraciones')).toBeTruthy();
  });

  it('shows the singular label for a single rating', () => {
    const { getByText } = render(
      <StarRating value={5} average={5} count={1} onRate={jest.fn()} />,
    );
    expect(getByText('5.0 · 1 valoración')).toBeTruthy();
  });

  it('shows a placeholder when there are no ratings', () => {
    const { getByText } = render(
      <StarRating value={null} average={0} count={0} onRate={jest.fn()} />,
    );
    expect(getByText('Sé el primero en valorar')).toBeTruthy();
  });

  it('disables all buttons when disabled', () => {
    const { getAllByRole } = render(
      <StarRating value={null} average={0} count={0} onRate={jest.fn()} disabled />,
    );
    getAllByRole('button').forEach((btn) =>
      expect(btn.props.accessibilityState.disabled).toBe(true),
    );
  });
});
