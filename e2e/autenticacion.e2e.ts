import { expect, test } from '@playwright/test';
import { CLAVE, crearUsuario, iniciarSesion, nuevaApi, unico } from './apoyo/api';

test.describe('registro e inicio de sesión', () => {
  test('una persona se registra como cliente, cierra sesión y vuelve a entrar', async ({
    page,
  }) => {
    const correo = `e2e.registro.${unico()}@trackit.test`;
    await page.goto('/registro');
    await page.getByText('Cliente', { exact: true }).click();
    await page.getByLabel('Nombres').fill('Laura');
    await page.getByLabel('Apellidos').fill('Rodríguez');
    await page.getByLabel('Correo').fill(correo);
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE);
    await page.getByLabel('Confirma la contraseña').fill(CLAVE);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    // Al crear la cuenta pasa al login con el correo ya escrito
    await expect(page).toHaveURL(/\/login\?correo=/);
    await expect(page.getByLabel('Correo')).toHaveValue(correo);
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/cliente\/inicio/);
    await expect(page.getByText('Laura Rodríguez').first()).toBeVisible();

    await page.getByRole('button', { name: /Menú de la cuenta/ }).click();
    await page
      .getByRole('menuitem', { name: 'Cerrar sesión' })
      .or(page.getByRole('button', { name: 'Cerrar sesión' }))
      .click();
    await expect(page).toHaveURL(/\/login/);

    await iniciarSesion(page, correo);
    await expect(page).toHaveURL(/\/cliente\/inicio/);
  });

  test('la contraseña se valida mientras se escribe', async ({ page }) => {
    await page.goto('/registro');
    await page.getByLabel('Contraseña', { exact: true }).fill('corta');
    await expect(page.getByText('Al menos 8 caracteres')).toBeVisible();
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE);
    await expect(page.getByText(/Al menos 8 caracteres.*cumplido|cumplido/).first()).toBeAttached();
  });

  test('una contraseña incorrecta muestra el error y no deja entrar', async ({ page }) => {
    const api = await nuevaApi();
    const cliente = await crearUsuario(api, 2, 'Carlos Cliente');
    await page.goto('/login');
    await page.getByLabel('Correo').fill(cliente.correo);
    await page.getByLabel('Contraseña', { exact: true }).fill('OtraClave99');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /incorrect|inválid/i })
        .first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('un cliente no puede entrar al panel de administración', async ({ page }) => {
    const api = await nuevaApi();
    const cliente = await crearUsuario(api, 2, 'Carlos Cliente');
    await iniciarSesion(page, cliente.correo);
    await page.goto('/admin/dashboard');
    await expect(page).not.toHaveURL(/\/admin/);
  });
});
