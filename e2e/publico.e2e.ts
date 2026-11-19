import { expect, test } from '@playwright/test';

/** Lo que ve cualquier persona sin iniciar sesión. */
test.describe('sitio público', () => {
  test('la página de inicio presenta el servicio y lleva al registro', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/TrackIt Express/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'De la vereda al casco urbano',
    );
    await page
      .getByRole('link', { name: /Crea tu cuenta|Crear cuenta|Regístrate/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/registro/);
    await expect(page.getByRole('heading', { name: 'Crea tu cuenta' })).toBeVisible();
  });

  test('una dirección que no existe muestra la página de no encontrado', async ({ page }) => {
    await page.goto('/esto-no-existe');
    await expect(
      page.getByRole('heading', { name: 'Esta dirección no lleva a ningún lado' }),
    ).toBeVisible();
  });

  test('un enlace de seguimiento inválido avisa que no encontró el envío', async ({ page }) => {
    await page.goto('/seguimiento/token-que-no-existe');
    await expect(page.getByRole('heading', { name: 'No encontramos ese envío' })).toBeVisible();
  });

  test('las páginas privadas piden iniciar sesión', async ({ page }) => {
    for (const ruta of ['/cliente/inicio', '/conductor/tablero', '/admin/dashboard']) {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
