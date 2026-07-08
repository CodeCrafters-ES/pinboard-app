import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { ReactionPicker } from '@/components/reactions';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('lucide-react-native', () => ({
  ThumbsUp: () => null,
  ThumbsDown: () => null,
  Heart: () => null,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EMPTY = { like: 0, dislike: 0, love: 0 };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ReactionPicker', () => {
  it('renders 3 reaction buttons', () => {
    const { getAllByRole } = render(
      <ReactionPicker activeReaction={null} counts={EMPTY} onToggle={jest.fn()} />,
    );
    expect(getAllByRole('button')).toHaveLength(3);
  });

  it('marks the active reaction as selected', () => {
    const { getByLabelText } = render(
      <ReactionPicker
        activeReaction="love"
        counts={{ like: 0, dislike: 0, love: 1 }}
        onToggle={jest.fn()}
      />,
    );
    const loveBtn = getByLabelText('Me encanta, activo, 1 reacción');
    expect(loveBtn.props.accessibilityState.selected).toBe(true);
  });

  it('calls onToggle with the correct type when pressed', () => {
    const onToggle = jest.fn();
    const { getByLabelText } = render(
      <ReactionPicker activeReaction={null} counts={EMPTY} onToggle={onToggle} />,
    );
    fireEvent.press(getByLabelText('Me gusta, 0 reacciones'));
    expect(onToggle).toHaveBeenCalledWith('like');
  });

  it('shows count when greater than zero', () => {
    const { getByText } = render(
      <ReactionPicker
        activeReaction={null}
        counts={{ like: 5, dislike: 0, love: 0 }}
        onToggle={jest.fn()}
      />,
    );
    expect(getByText('5')).toBeTruthy();
  });

  it('disables all buttons when loading is true', () => {
    const { getAllByRole } = render(
      <ReactionPicker activeReaction={null} counts={EMPTY} onToggle={jest.fn()} loading />,
    );
    const buttons = getAllByRole('button');
    buttons.forEach((btn) => expect(btn.props.accessibilityState.disabled).toBe(true));
  });
});
