const express = require("express");
const app = express();
const mysql = require("mysql");
const cors = require("cors");


const qrcode = require('qrcode-terminal')
const {Client, LocalAuth} = require('whatsapp-web.js')

const client = new Client({
  authStrategy: new LocalAuth()
})

client.on('qr', qr=>{
    qrcode.generate(qr,{small:true})
})

client.on('ready', ()=> {
  console.log('client is ready!')
})

client.initialize();


app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "remis";
const DB_PORT = process.env.DB_PORT || 3306;

const db = mysql.createConnection({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  port: DB_PORT,
  database: DB_NAME,
});

app.post("/login", async (req, res) => {
  const { usuario, contrasena } = req.body;

  if (!usuario || !contrasena) {
    return res.status(400).json({ error: "Invalid credentials" });
  }

  db.query(
    "SELECT * FROM administradores WHERE usuario = ? AND contrasena = ?",
    [usuario, contrasena],
    async (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      if (results.length > 0) {
        const usuarioEncontrado = results[0];
        res.status(200).json({
          message: "Login successful",
          usuario: {
            id: usuarioEncontrado.id_admin,
            usuario: usuarioEncontrado.usuario,
          },
        });
        console.log(usuarioEncontrado);
      } else {
        // Usuario no encontrado o contraseña incorrecta
        res.status(401).json({ error: "Invalid credentials" });
      }
    }
  );
});

//VIAJES

app.post("/nuevo-viaje", (req, res) => {
  try {
    const origen = req.body.origen;
    const detalles = req.body.detalles;
    const fecha = req.body.fecha;
    const hora = req.body.hora;
    const cliente = req.body.cliente;
    const admin = req.body.id_usuario;

    if (!origen) {
      res.status(400).json({ error: "Todos los campos son requeridos" });
      return;
    }

    db.query(
      "INSERT INTO viajes (origen,detalles,fecha,hora,id_cliente,id_admin) VALUES (?,?,?,?,?,?)",
      [origen, detalles, fecha, hora, cliente, admin],
      (err, result) => {
        if (err) {
          console.error("Error en la consulta SQL:", err);
          res.status(500).json({ error: "Error interno del servidor" });
        } else {
          // res.status(200).json({ message: "Viaje registrado con éxito" });
          const id = result.insertId; // Asumiendo que estás usando una base de datos que proporciona el ID insertado
          res.status(200).json({
            message: "Viaje registrado con éxito",
            id,
          });
        }
      }
    );
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error inesperado en el servidor" });
  }
});

app.get("/viajes", async (req, res) => {
  try {
    // Configuración regional para idioma español
    await db.query("SET lc_time_names = 'es_ES';");
    const { fecha } = req.query;

    let query = `
      SELECT
        viajes.*,
        DATE_FORMAT(viajes.fecha, '%e %b') AS fecha_formateada,
        estado_viaje.estado AS estado,
        choferes.nombre AS chofer_nombre,
        choferes.apellido AS chofer_apellido,
        moviles.numero_movil AS numero_movil
      FROM viajes
      LEFT JOIN estado_viaje ON viajes.id_estado = estado_viaje.id_estado
      LEFT JOIN choferes ON viajes.id_chofer = choferes.id_chofer
      LEFT JOIN moviles ON viajes.id_movil = moviles.id_movil
    `;

    if (fecha) {
      query += `WHERE fecha = ? ORDER BY hora;`;
    } else {
      // query += `ORDER BY id DESC LIMIT 10;`;
      query += `ORDER BY fecha DESC, hora DESC LIMIT 15;`;
    }

    db.query(query, [fecha], (err, result) => {
      if (err) {
        console.error("Error en la consulta SQL:", err);
        res.status(500).json({ error: "Error interno del servidor" });
      } else {
        res.status(200).json(result);
      }
    });
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.get("/estado-viaje", async (req, res) => {
  try {
    db.query("SELECT * FROM estado_viaje", (err, result) => {
      if (err) {
        console.error("Error en la consulta SQL:", err);
        res.status(500).json({ error: "Error interno del servidor" });
      } else {
        res.status(200).json(result);
      }
    });
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.patch("/editar-viaje/:id", (req, res) => {
  try {
    const idViaje = req.params.id;
    const nuevosDatos = req.body;

    db.query(
      "UPDATE viajes SET ? WHERE id = ?",
      [nuevosDatos, idViaje],
      (err, result) => {
        if (err) {
          console.error("Error en la consulta SQL:", err);
          res.status(500).json({ error: "Error interno del servidor" });
        } else {
          res.status(200).json({ message: "Viaje actualizado con éxito" });
        }
      }
    );
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error inesperado en el servidor" });
  }
});

app.patch("/asignar-movil/:viajeId", (req, res) => {
  const viajeId = req.params.viajeId;
  const { movil, chofer } = req.body;

  db.query(
    "UPDATE viajes SET id_movil = ?, id_chofer = ?, id_estado = 2 WHERE id = ?",
    [movil, chofer, viajeId],
    (err, result) => {
      if (err) {
        console.error("Error en la consulta SQL:", err);
        res.status(500).json({ error: "Error interno del servidor" });
      } else {
        res.status(200).json({ movil, chofer, asignado: true });
      }
    }
  );
});

app.patch("/ingresar-importe/:viajeId", (req, res) => {
  const viajeId = req.params.viajeId;
  const { importe, destino, id_estado } = req.body;

  db.query(
    "UPDATE viajes SET importe = ?, destino = ?, id_estado = ? WHERE id = ?",
    [importe, destino, id_estado, viajeId],
    (err, result) => {
      if (err) {
        console.error("Error en la consulta SQL:", err);
        res.status(500).json({ error: "Error interno del servidor" });
      } else {
        res.status(200).json({ importe, destino, id_estado: 3 });
      }
    }
  );
});

app.patch("/ingresar-destino/:viajeId", (req, res) => {
  const viajeId = req.params.viajeId;
  const { destino } = req.body;

  db.query(
    "UPDATE viajes SET destino = ? WHERE id = ?",
    [destino, viajeId],
    (err, result) => {
      if (err) {
        console.error("Error en la consulta SQL:", err);
        res.status(500).json({ error: "Error interno del servidor" });
      } else {
        res.status(200).json({ destino });
      }
    }
  );
});

app.delete("/eliminar-viaje/:id", (req, res) => {
  try {
    const idViaje = req.params.id;

    db.query("DELETE FROM viajes WHERE id = ?", [idViaje], (err, result) => {
      if (err) {
        console.error("Error en la consulta SQL:", err);
        res.status(500).json({ error: "Error interno del servidor" });
      } else {
        if (result.affectedRows > 0) {
          res.status(200).json({ message: "Viaje eliminado con éxito" });
        } else {
          res
            .status(404)
            .json({ error: "No se encontró el viaje con el ID proporcionado" });
        }
      }
    });
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error inesperado en el servidor" });
  }
});





//enviar viaje por whatsapp

app.post('/enviar-mensaje', async(req, res) => {
  const { tel, mensaje } = req.body;
// const tel = '+5492284656640' // Número de teléfono en el formato adecuado
const chatId = tel.substring(1) + "@c.us"
const number_details = await client.getNumberId(chatId)

if (number_details) {
  // const mensaje = "Holaaaa bien ahi che"
  await client.sendMessage(chatId, mensaje)
  res.json({res:true})
}else{
  res.json({res:false})
}
});



//MOVILES

app.post("/nuevo-movil", (req, res) => {
  try {
    const titular = req.body.titular;
    const contacto = req.body.contacto;
    const dominio = req.body.dominio;
    const modelo = req.body.modelo;
    const numero_movil = req.body.numero;
    const activo = false;
    const visible = true;

    if (!titular || !contacto || !dominio || !modelo || !numero_movil) {
      res.status(400).json({ error: "Todos los campos son requeridos" });
      return;
    }

    db.query(
      "INSERT INTO moviles (titular, contacto, dominio, modelo, numero_movil, activo, visible) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [titular, contacto, dominio, modelo, numero_movil, activo, visible],
      (err, result) => {
        if (err) {
          console.error("Error en la consulta SQL:", err);
          res.status(500).json({ error: "Error interno del servidor" });
        } else {
          const id = result.insertId;
          res.status(200).json({
            message: "Movil registrado con éxito",
            id,
          });
        }
      }
    );
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error inesperado en el servidor" });
  }
});


app.get("/moviles", async (req, res) => {
  try {
    const query = `
      SELECT 
        moviles.*, 
        choferes.nombre as nombre_chofer,
        choferes.apellido as apellido_chofer
      FROM moviles
      LEFT JOIN choferes ON moviles.id_chofer = choferes.id_chofer
      WHERE moviles.visible = true;
    `;

    db.query(query, (err, result) => {
      if (err) {
        console.error("Error en la consulta SQL:", err);
        res.status(500).json({ error: "Error interno del servidor" });
      } else {
        res.status(200).json(result);
      }
    });
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.patch("/editar-movil/:id", (req, res) => {
  try {
    const idMovil = req.params.id;
    const nuevosDatos = req.body;

    db.query(
      "UPDATE moviles SET ? WHERE id_movil = ?",
      [nuevosDatos, idMovil],
      (err, result) => {
        if (err) {
          console.error("Error en la consulta SQL:", err);
          res.status(500).json({ error: "Error interno del servidor" });
        } else {
          res.status(200).json({ message: "Viaje actualizado con éxito" });
        }
      }
    );
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error inesperado en el servidor" });
  }
});



app.patch("/eliminar-movil/:id", (req, res) => {
  try {
    const idMovil = req.params.id;

    db.query(
      "UPDATE moviles SET visible = false, activo = false WHERE id_movil = ?",
      [idMovil],
      (err, result) => {
        if (err) {
          console.error("Error en la consulta SQL:", err);
          res.status(500).json({ error: "Error interno del servidor" });
        } else {
          if (result.affectedRows > 0) {
            res.status(200).json({ message: "Movil eliminado con éxito" });
          } else {
            res.status(404).json({
              error: "No se encontró el movil con el ID proporcionado",
            });
          }
        }
      }
    );
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error inesperado en el servidor" });
  }
});

app.patch("/actualizar-estado-movil/:id", (req, res) => {
  const movilId = req.params.id;
  const { estado } = req.body;
  console.log(movilId);
  console.log(estado);

  db.query(
    "UPDATE moviles SET activo = ? WHERE id_movil = ?",
    [estado, movilId],
    (err, result) => {
      if (err) {
        console.error("Error en la consulta SQL:", err);
        res.status(500).json({ error: "Error interno del servidor" });
      } else {
        res.status(200).json({ estado });
      }
    }
  );
});

app.patch("/asignar-chofer/:movilId", (req, res) => {
  const movilId = req.params.movilId;
  const id_chofer = req.body.id_chofer;

  db.query(
    "UPDATE moviles SET id_chofer = ? WHERE id_movil = ?",
    [id_chofer, movilId],
    (err, result) => {
      if (err) {
        console.error("Error en la consulta SQL:", err);
        res.status(500).json({ error: "Error interno del servidor" });
      } else {
        res.status(200).json({ movilId, id_chofer });
      }
    }
  );
});

//CHOFERES

app.post("/nuevo-chofer", (req, res) => {
  try {
    const nombre = req.body.nombre;
    const apellido = req.body.apellido;
    const dni = req.body.dni;
    const contacto = req.body.contacto;
    const visible = true;

    if (!nombre || !apellido || !dni || !contacto) {
      res.status(400).json({ error: "Todos los campos son requeridos" });
      return;
    }

    db.query(
      "INSERT INTO choferes (nombre, apellido, dni, contacto, visible) VALUES (?, ?, ?, ?, ?)",
      [nombre, apellido, dni, contacto, visible],
      (err, result) => {
        if (err) {
          console.error("Error en la consulta SQL:", err);
          res.status(500).json({ error: "Error interno del servidor" });
        } else {
          // res.status(200).json({ message: "Móvil registrado con éxito" });
          const id = result.insertId;
          res.status(200).json({
            message: "Chofer registrado con éxito",
            id,
          });
        }
      }
    );
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error inesperado en el servidor" });
  }
});

app.get("/choferes", async (req, res) => {
  try {
    db.query("SELECT * FROM choferes WHERE visible = true;", (err, result) => {
      if (err) {
        console.error("Error en la consulta SQL:", err);
        res.status(500).json({ error: "Error interno del servidor" });
      } else {
        res.status(200).json(result);
      }
    });
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.patch("/editar-chofer/:id", (req, res) => {
  try {
    const idChofer = req.params.id;
    const nuevosDatos = req.body;

    db.query(
      "UPDATE choferes SET ? WHERE id_chofer = ?",
      [nuevosDatos, idChofer],
      (err, result) => {
        if (err) {
          console.error("Error en la consulta SQL:", err);
          res.status(500).json({ error: "Error interno del servidor" });
        } else {
          res.status(200).json({ message: "Chofer actualizado con éxito" });
        }
      }
    );
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error inesperado en el servidor" });
  }
});

app.patch("/eliminar-chofer/:id", (req, res) => {
  try {
    const idChofer = req.params.id;

    db.query(
      "UPDATE choferes SET visible = false WHERE id_chofer = ?",
      [idChofer],
      (err, result) => {
        if (err) {
          console.error("Error en la consulta SQL:", err);
          res.status(500).json({ error: "Error interno del servidor" });
        } else {
          if (result.affectedRows > 0) {
            res.status(200).json({ message: "Chofer eliminado con éxito" });
          } else {
            res.status(404).json({
              error: "No se encontró el movil con el ID proporcionado",
            });
          }
        }
      }
    );
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error inesperado en el servidor" });
  }
});

//FACTURACION

// Cambia el nombre del parámetro a id_movil en la ruta
app.get("/liquidar-movil/:id_movil", async (req, res) => {
  try {
    // Usa req.params.id_movil para recuperar el valor
    const id_movil = req.params.id_movil;
    console.log("ID recibido:", id_movil); // Agrega este console.log
    db.query(
      "SELECT * FROM viajes WHERE id_movil = ? AND id_estado = 3",
      [id_movil],
      (err, result) => {
        if (err) {
          console.error("Error en la consulta SQL:", err);
          res.status(500).json({ error: "Error interno del servidor" });
        } else {
          res.status(200).json(result);
        }
      }
    );
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.patch("/liquidar/:id_movil", (req, res) => {
  const id_movil = req.params.id_movil;

  db.query(
    "UPDATE viajes SET id_estado = 4 WHERE id_estado = 3 AND id_movil = ?",
    [id_movil],
    (err, result) => {
      if (err) {
        console.error("Error en la consulta SQL:", err);
        res.status(500).json({ error: "Error interno del servidor" });
      } else {
        res.status(200).json({ id_movil });
      }
    }
  );
});

app.get("/facturados", async (req, res) => {
  try {
    const fecha = req.query.fecha || new Date().toISOString().split("T")[0];

    db.query(
      "SELECT viajes.*, moviles.numero_movil, choferes.nombre AS nombre_chofer, choferes.apellido AS apellido_chofer " +
        "FROM viajes " +
        "LEFT JOIN moviles ON viajes.id_movil = moviles.id_movil " +
        "LEFT JOIN choferes ON viajes.id_chofer = choferes.id_chofer " +
        "WHERE viajes.id_estado = 4 AND viajes.fecha = ? " +
        "ORDER BY viajes.hora",
      [fecha],
      (err, result) => {
        if (err) {
          console.error("Error en la consulta SQL:", err);
          res.status(500).json({ error: "Error interno del servidor" });
        } else {
          res.status(200).json(result);
        }
      }
    );
  } catch (error) {
    console.error("Error inesperado:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Corriendo en el puerto ${PORT}`);
});
