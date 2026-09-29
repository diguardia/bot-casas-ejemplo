import type { Movement, State } from "./types.js";

// La estrategia no depende de Express: recibe un estado y devuelve una decisión.
// Por ahora no usa el dado ni comprueba obstáculos o límites del tablero.
export function chooseMove(state: State): Movement {
  // Acumulamos un movimiento por cada pieza propia recorriendo todas las filas.
  const movements: Movement = {};
  for (const row of state.tablero) {
    for (const cell of row) {
      // El prefijo identifica al dueño; las casillas vacías y neutrales se ignoran.
      if (cell !== "" && cell !== "N" && cell.startsWith(state.jugador)) {
        movements[cell] = "N";
      }
    }
  }

  // Si el jugador no tiene piezas, no proponemos ningún movimiento.
  return movements;
}



// Ejemplo: si cell contiene "casilla5", [cell] pone ese contenido como clave:
// { [cell]: "N" } produce { casilla5: "N" }.
// Sin corchetes, { cell: "N" } usa la palabra "cell" como clave:
// produce { cell: "N" }, sin buscar el contenido de la variable.
//
// Con o sin «as const», al ejecutar el programa se obtiene el mismo objeto.
// La diferencia está en cómo TypeScript interpreta el valor:
// sin «as const», puede inferir string (cualquier texto, incluso "hola");
// con «as const», el tipo del valor es exactamente "N".
// Si se esperan solo direcciones permitidas, como "N" o "S", un string
// general podría rechazarse, pero el valor exacto "N" sí es válido.
// «as const» hace más preciso el tipo; no cambia el comportamiento.
// Si al quitarlo no hay errores de tipos, puede no ser necesario aquí.
