// =====================================================================
// registro.js
// Maneja el formulario de registro de nuevos usuarios (personal de la clínica)
// usando Supabase Auth (signUp). El perfil en usuarios_perfil se crea
// automáticamente mediante un trigger en la base de datos (ver supabase_schema.sql).
// =====================================================================

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("form-registro");
    const alerta = document.getElementById("alerta-registro");
    const btnSubmit = document.getElementById("btn-registro-submit");

    function mostrarAlerta(mensaje, tipo = "error") {
        alerta.textContent = mensaje;
        alerta.className = `alerta ${tipo}`;
        alerta.classList.remove("hidden");
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        alerta.classList.add("hidden");

        const nombre = document.getElementById("reg-nombre").value.trim();
        const correo = document.getElementById("reg-correo").value.trim();
        const rol = document.getElementById("reg-rol").value;
        const password = document.getElementById("reg-password").value;
        const password2 = document.getElementById("reg-password2").value;

        // ---- Validaciones obligatorias ----
        const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);

        if (!nombre) {
            mostrarAlerta("El nombre completo es obligatorio.");
            return;
        }
        if (!correo) {
            mostrarAlerta("El correo es obligatorio.");
            return;
        }
        if (!correoValido) {
            mostrarAlerta("El correo debe tener un formato válido.");
            return;
        }
        if (!rol) {
            mostrarAlerta("Debe seleccionar un rol. No se permite registrar usuarios sin rol.");
            return;
        }
        if (password.length < 6) {
            mostrarAlerta("La contraseña debe tener al menos 6 caracteres.");
            return;
        }
        if (password !== password2) {
            mostrarAlerta("La confirmación de contraseña no coincide.");
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando cuenta...';

        // signUp con metadata: el trigger crear_perfil_usuario() en Supabase
        // lee raw_user_meta_data para crear la fila en usuarios_perfil automáticamente.
        const { data, error } = await supabaseClient.auth.signUp({
            email: correo,
            password: password,
            options: {
                data: {
                    nombre: nombre,
                    rol: rol,
                },
            },
        });

        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fas fa-user-plus"></i> Crear cuenta';

        if (error) {
            if (error.message.includes("already registered") || error.code === "user_already_exists") {
                mostrarAlerta("Ese correo ya está registrado.");
            } else {
                mostrarAlerta("Error al crear la cuenta: " + error.message);
            }
            return;
        }

        if (data?.user) {
            mostrarAlerta(
                "Cuenta creada con éxito. Ya puedes iniciar sesión.",
                "exito"
            );
            form.reset();
            setTimeout(() => (window.location.href = "login.html"), 1800);
        }
    });
});
