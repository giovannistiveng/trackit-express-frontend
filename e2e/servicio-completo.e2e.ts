import { expect, test } from '@playwright/test';
import path from 'node:path';
import {
  crearConductorAprobado,
  crearEnvio,
  crearUsuario,
  iniciarSesion,
  nuevaApi,
} from './apoyo/api';

const FOTO = path.join(__dirname, 'apoyo', 'foto.jpg');

/**
 * El recorrido completo de un pedido entre dos personas en dos navegadores:
 * el cliente pide, el conductor acepta, recoge con el código, entrega con el PIN
 * y cobra en efectivo; el cliente ve el pedido entregado y califica.
 */
test('un pedido va de Pendiente a Entregado y el cliente lo califica', async ({ browser }) => {
  const api = await nuevaApi();
  const cliente = await crearUsuario(api, 2, 'Ana Cliente');
  const conductor = await crearConductorAprobado(api);
  const envio = await crearEnvio(api, cliente);

  const ctxConductor = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: 4.337, longitude: -74.364 },
  });
  const ctxCliente = await browser.newContext();
  const pConductor = await ctxConductor.newPage();
  const pCliente = await ctxCliente.newPage();

  await test.step('el cliente ve su pedido buscando conductor', async () => {
    await iniciarSesion(pCliente, cliente.correo);
    await pCliente.goto(`/cliente/envios/${envio.id_envio}`);
    await expect(pCliente.getByText('Buscando conductor').first()).toBeVisible();
  });

  await test.step('el conductor acepta el servicio desde el tablero', async () => {
    await iniciarSesion(pConductor, conductor.correo);
    await expect(pConductor).toHaveURL(/\/conductor\/tablero/);
    const tarjeta = pConductor
      .locator('article, li')
      .filter({ hasText: `#${envio.id_envio}` })
      .first();
    await tarjeta.getByRole('button', { name: 'Aceptar servicio' }).click();
    await pConductor.getByRole('dialog').getByRole('button', { name: 'Aceptar servicio' }).click();
    await expect(pConductor.getByRole('button', { name: 'Llegué a recoger' })).toBeVisible();
  });

  await test.step('recoge la carga con el código, los bultos y la foto', async () => {
    await pConductor.getByRole('button', { name: 'Llegué a recoger' }).click();
    await pConductor.getByRole('button', { name: 'Recoger la carga' }).first().click();
    const modal = pConductor.getByRole('dialog');
    await modal.getByLabel('Código de recogida').fill(String(envio.codigo_recogida));
    await modal.getByLabel('Bultos que recibes').fill('1');
    await modal.locator('input[type=file]').first().setInputFiles(FOTO);
    await modal.getByRole('button', { name: 'Confirmar y salir a entregar' }).click();
    await expect(pConductor.getByRole('button', { name: 'Llegué a entregar' })).toBeVisible();
  });

  await test.step('el cliente ve que el pedido va en camino', async () => {
    await pCliente.reload();
    await expect(pCliente.getByText('En camino').first()).toBeVisible();
  });

  await test.step('entrega con el PIN, la foto y el efectivo recibido', async () => {
    await pConductor.getByRole('button', { name: 'Llegué a entregar' }).click();
    await pConductor.getByRole('button', { name: 'Finalizar entrega' }).first().click();
    const modal = pConductor.getByRole('dialog');
    for (const digito of String(envio.pin_seguridad)) {
      await modal.getByRole('button', { name: digito, exact: true }).click();
    }
    await modal.locator('input[type=file]').first().setInputFiles(FOTO);
    await modal.getByRole('checkbox', { name: /Recibí .* en efectivo/ }).check();
    await modal.getByRole('button', { name: 'Finalizar entrega' }).click();
    await expect(modal).toBeHidden();
  });

  await test.step('el cliente ve el pedido entregado y lo califica', async () => {
    await pCliente.reload();
    await expect(pCliente.getByText('Entregado').first()).toBeVisible();
    // Al ver el pedido entregado se abre solo el modal para calificar
    const modal = pCliente.getByRole('dialog', { name: /Cómo te fue con la entrega/ });
    await expect(modal).toBeVisible();
    await modal.getByRole('radio', { name: '5 estrellas' }).click();
    await modal.getByLabel('Comentario').fill('Muy rápido y amable');
    await modal.getByRole('button', { name: 'Enviar calificación' }).click();
    await expect(pCliente.getByText('¡Gracias por calificar!')).toBeVisible();
  });

  const final = await api.get(`envios/${envio.id_envio}`, {
    headers: { Authorization: `Bearer ${cliente.token}` },
  });
  expect((await final.json()).envio).toMatchObject({ estado: 'Entregado', calificacion: 5 });

  await ctxConductor.close();
  await ctxCliente.close();
});
