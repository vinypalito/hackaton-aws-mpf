import { TestBed } from '@angular/core/testing';
import { CarregandoTsuru } from './carregando-tsuru';

describe('CarregandoTsuru', () => {
  it('anuncia a mensagem padrão numa região de status e esconde o SVG decorativo', async () => {
    const fixture = TestBed.createComponent(CarregandoTsuru);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const status = el.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent?.trim()).toBe('Carregando…');
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelectorAll('svg path').length).toBe(6);
  });

  it('aceita uma mensagem personalizada', async () => {
    const fixture = TestBed.createComponent(CarregandoTsuru);
    fixture.componentRef.setInput('mensagem', 'Carregando expediente…');
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="status"]')?.textContent?.trim()).toBe('Carregando expediente…');
  });
});
