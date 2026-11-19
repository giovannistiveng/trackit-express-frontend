import { expect, test } from '@playwright/test';
import { ADMIN, crearConductorPendiente, iniciarSesion, nombreUnico, nuevaApi } from './apoyo/api';

test.describe('administración', () => {
  test('el panel muestra las métricas de operación', async ({ page }) => {
    await iniciarSesion(page, ADMIN.correo, ADMIN.clave);
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Métricas de operación' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Envíos por estado' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Envíos por zona' })).toBeVisible();
  });

  test('revisa los documentos de un conductor y lo aprueba', async ({ page }) => {
    const api = await nuevaApi();
    const nombre = nombreUnico('Pedro');
    await crearConductorPendiente(api, 'Moto Express', nombre);

    await iniciarSesion(page, ADMIN.correo, ADMIN.clave);
    await page.goto('/admin/conductores');
    await expect(page.getByRole('heading', { name: 'Verificación de conductores' })).toBeVisible();

    // Aprueba uno por uno los documentos pendientes del conductor
    const tarjeta = page.getByRole('listitem').filter({ hasText: nombre }).first();
    const pendientes = tarjeta.getByRole('button', { name: 'Revisar', exact: true });
    await expect(pendientes).toHaveCount(6);
    for (let quedan = 6; quedan > 0; quedan--) {
      await pendientes.first().click();
      await page.getByRole('dialog').getByRole('button', { name: 'Aprobar documento' }).click();
      await expect(pendientes).toHaveCount(quedan - 1);
    }
    await expect(tarjeta.getByText('6/6')).toBeVisible();

    await tarjeta.getByRole('button', { name: 'Aprobar conductor' }).click();
    await page
      .getByRole('dialog', { name: `Aprobar a ${nombre}` })
      .getByRole('button', { name: 'Aprobar', exact: true })
      .click();
    await expect(page.getByText(nombre)).toHaveCount(0);
  });
});
