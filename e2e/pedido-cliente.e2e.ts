import { expect, test } from '@playwright/test';
import {
  crearEnvio,
  crearUsuario,
  iniciarSesion,
  nuevaApi,
  simularBuscadorDirecciones,
} from './apoyo/api';

test.describe('pedidos del cliente', () => {
  test('cotiza y crea un pedido desde el formulario', async ({ page }) => {
    const api = await nuevaApi();
    const cliente = await crearUsuario(api, 2, 'Ana Cliente');
    await simularBuscadorDirecciones(page);
    await iniciarSesion(page, cliente.correo);

    await page.getByRole('link', { name: 'Pedir' }).first().click();
    await expect(page.getByRole('heading', { name: 'Nuevo pedido' })).toBeVisible();

    await page.getByRole('combobox', { name: 'Recoger en' }).fill('Parque');
    await page.getByRole('option', { name: /Parque principal/ }).click();
    await page.getByRole('combobox', { name: 'Entregar en' }).fill('Balmoral');
    await page.getByRole('option', { name: /Balmoral/ }).click();

    // El precio aparece solo al tener origen y destino
    const confirmar = page.getByRole('button', { name: /^Confirmar \$ [\d.]+$/ });
    await expect(confirmar).toBeVisible();
    await expect(page.getByText('1.53 km').first()).toBeVisible();
    await confirmar.click();

    await expect(page.getByText('Código de recogida').first()).toBeVisible();
    await page.getByRole('link', { name: 'Seguir este pedido' }).click();
    await expect(page).toHaveURL(/\/cliente\/envios\/\d+/);
    await expect(page.getByText('Buscando conductor').first()).toBeVisible();
    await expect(page.getByText('Barrio Balmoral').first()).toBeVisible();
  });

  test('cancela un pedido que nadie ha tomado', async ({ page }) => {
    const api = await nuevaApi();
    const cliente = await crearUsuario(api, 2, 'Ana Cliente');
    const envio = await crearEnvio(api, cliente);
    await iniciarSesion(page, cliente.correo);
    await page.goto(`/cliente/envios/${envio.id_envio}`);

    await page
      .getByRole('button', { name: /Cancelar (el )?(pedido|envío)/ })
      .first()
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sí, cancelar envío' }).click();
    await expect(page.getByText('Cancelado').first()).toBeVisible();
  });

  test('el historial lista los pedidos del cliente', async ({ page }) => {
    const api = await nuevaApi();
    const cliente = await crearUsuario(api, 2, 'Ana Cliente');
    const envio = await crearEnvio(api, cliente);
    await iniciarSesion(page, cliente.correo);
    await page.getByRole('link', { name: 'Pedidos' }).first().click();
    await expect(page).toHaveURL(/\/cliente\/envios/);
    await expect(page.getByText(`#${envio.id_envio}`).first()).toBeVisible();
  });
});
