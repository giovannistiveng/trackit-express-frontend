import { expect, test } from '@playwright/test';
import {
  crearConductorAprobado,
  crearEnvio,
  crearUsuario,
  iniciarSesion,
  nuevaApi,
} from './apoyo/api';

/** El conductor trabaja desde el celular: se prueba con la pantalla de un Pixel 7. */
test.describe('conductor en el celular', () => {
  test('ve los servicios disponibles y navega a ganancias y perfil', async ({ page }) => {
    const api = await nuevaApi();
    const cliente = await crearUsuario(api, 2, 'Ana Cliente');
    const conductor = await crearConductorAprobado(api);
    const envio = await crearEnvio(api, cliente);

    await iniciarSesion(page, conductor.correo);
    await expect(page.getByRole('heading', { name: 'Servicios disponibles' })).toBeVisible();
    const tarjeta = page
      .locator('article, li')
      .filter({ hasText: `#${envio.id_envio}` })
      .first();
    await expect(tarjeta.getByRole('button', { name: 'Aceptar servicio' })).toBeVisible();

    await page.getByRole('link', { name: 'Ganancias' }).first().click();
    await expect(page).toHaveURL(/\/conductor\/ganancias/);
    await page.getByRole('link', { name: 'Mi perfil' }).first().click();
    await expect(page).toHaveURL(/\/conductor\/perfil/);
    await expect(page.getByText(conductor.placa).first()).toBeVisible();
  });
});
