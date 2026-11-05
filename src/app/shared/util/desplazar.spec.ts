import { desplazarA } from './desplazar';

describe('desplazarA', () => {
  afterEach(() => document.body.replaceChildren());

  it('desplaza suavemente hasta el elemento indicado', () => {
    const el = document.createElement('section');
    el.id = 'chat';
    const scroll = vi.fn();
    el.scrollIntoView = scroll;
    document.body.append(el);
    desplazarA('chat', 'start');
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('no falla si el elemento no existe o el navegador no soporta scrollIntoView', () => {
    expect(() => desplazarA('no-existe')).not.toThrow();
    const el = document.createElement('div');
    el.id = 'sin-soporte';
    document.body.append(el);
    expect(() => desplazarA('sin-soporte')).not.toThrow();
  });
});
