(() => {
  'use strict';

  // Evita que el arranque original fuerce refreshSession() cada vez
  // que se abre la app.
  if (typeof verificarSesion === 'function') {
    document.removeEventListener('DOMContentLoaded', verificarSesion);
  }

  const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  async function reintentarConsulta(nombre, consulta) {
    let ultimoError = null;

    for (let intento = 1; intento <= 2; intento++) {
      try {
        const resultado = await consulta();

        if (resultado?.error) {
          throw resultado.error;
        }

        return resultado;
      } catch (error) {
        ultimoError = error;
        console.warn(`${nombre}: intento ${intento} falló:`, error?.message || error);

        if (intento === 1) {
          // Si la sesión estaba terminando de restaurarse o renovar el token,
          // le damos un momento y pedimos a Supabase que la refresque.
          try {
            const { data: { session } } = await _supabase.auth.getSession();

            if (session) {
              await _supabase.auth.refreshSession();
            }
          } catch (refreshError) {
            console.warn('No se pudo refrescar la sesión durante el reintento:', refreshError?.message || refreshError);
          }

          await esperar(700);
        }
      }
    }

    throw ultimoError || new Error(`No se pudo completar ${nombre}.`);
  }

  // Reemplaza la carga de ventas por una versión con un reintento silencioso.
  window.cargarVentas = async function cargarVentasRobusto() {
    try {
      const { data } = await reintentarConsulta('cargar ventas', () =>
        _supabase
          .from('ventas_taller')
          .select('*')
          .order('fecha_venta', { ascending: false })
      );

      estadoApp.ventas = data || [];

      renderizarVentas();
      renderizarMarketing();
      renderizarFinanzas();
      renderizarInicio();
    } catch (error) {
      console.error('Error definitivo al cargar las ventas desde Supabase:', error?.message || error);
      alert('No se pudieron cargar las ventas. Verificá tu conexión e intentá nuevamente.');
    }
  };

  // Reemplaza la carga de gastos por una versión con un reintento silencioso.
  window.cargarGastos = async function cargarGastosRobusto() {
    try {
      const { data } = await reintentarConsulta('cargar gastos', () =>
        _supabase
          .from('gastos_taller')
          .select('*')
          .order('fecha', { ascending: false })
      );

      estadoApp.gastos = data || [];

      poblarFiltroMes();
      renderizarFinanzas();
    } catch (error) {
      console.error('Error definitivo al cargar los gastos desde Supabase:', error?.message || error);
      alert('No se pudieron cargar los gastos. Verificá tu conexión e intentá nuevamente.');
    }
  };

  // Reemplaza la carga de publicidad por una versión con un reintento silencioso.
  window.cargarPublicidad = async function cargarPublicidadRobusto() {
    try {
      const { data } = await reintentarConsulta('cargar publicidad', () =>
        _supabase
          .from('gastos_publicidad')
          .select('*')
          .order('fecha', { ascending: false })
      );

      estadoApp.publicidad = data || [];
      renderizarMarketing();
    } catch (error) {
      console.error('Error definitivo al cargar los gastos de publicidad desde Supabase:', error?.message || error);
      alert('No se pudieron cargar los gastos de publicidad. Verificá tu conexión e intentá nuevamente.');
    }
  };

  async function obtenerSesionConReintento() {
    let resultado = await _supabase.auth.getSession();

    if (!resultado.error) {
      return resultado.data?.session || null;
    }

    console.warn('Primer intento de recuperar sesión falló:', resultado.error.message);
    await esperar(500);

    resultado = await _supabase.auth.getSession();

    if (resultado.error) {
      throw resultado.error;
    }

    return resultado.data?.session || null;
  }

  async function verificarSesionRobusto() {
    const loginScreen = document.getElementById('login-screen');
    const appContent = document.getElementById('app-content');

    const mostrarLogin = () => {
      loginScreen?.classList.remove('hidden');
      appContent?.classList.add('hidden');
    };

    try {
      // No forzamos refreshSession() al abrir.
      // Supabase ya está configurado con autoRefreshToken: true.
      const session = await obtenerSesionConReintento();

      if (!session) {
        mostrarLogin();
        return;
      }

      loginScreen?.classList.add('hidden');
      appContent?.classList.remove('hidden');

      await inicializar();
    } catch (error) {
      console.error('No se pudo iniciar la app correctamente:', error?.message || error);

      // No borramos la sesión local por un error transitorio.
      mostrarLogin();
    }
  }

  document.addEventListener('DOMContentLoaded', verificarSesionRobusto);
})();