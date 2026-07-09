import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { CommentComposer } from '@/components/comments';

// CommentComposer importa MAX_COMMENT_LENGTH de @/lib/comments, que a su vez carga
// @/lib/supabase (createClient con env de Expo, no disponible en jest).
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('CommentComposer', () => {
  it('el botón está deshabilitado cuando el campo está vacío', () => {
    const onSubmit = jest.fn();
    const { getByLabelText } = render(<CommentComposer onSubmit={onSubmit} />);

    fireEvent.press(getByLabelText('Comentar'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envía el comentario recortado y limpia el campo', () => {
    const onSubmit = jest.fn();
    const { getByLabelText } = render(<CommentComposer onSubmit={onSubmit} />);

    const input = getByLabelText('Nuevo comentario');
    fireEvent.changeText(input, '  hola mundo  ');
    fireEvent.press(getByLabelText('Comentar'));

    expect(onSubmit).toHaveBeenCalledWith('hola mundo');
  });

  it('no envía cuando solo hay espacios', () => {
    const onSubmit = jest.fn();
    const { getByLabelText } = render(<CommentComposer onSubmit={onSubmit} />);

    fireEvent.changeText(getByLabelText('Nuevo comentario'), '    ');
    fireEvent.press(getByLabelText('Comentar'));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('muestra el contador de caracteres', () => {
    const { getByText, getByLabelText } = render(<CommentComposer onSubmit={jest.fn()} />);

    fireEvent.changeText(getByLabelText('Nuevo comentario'), 'abc');
    expect(getByText('3/2000')).toBeTruthy();
  });
});
