class Calculator {
  constructor() {
    this.result = 0;
  }

  add(number) {
    if (typeof number !== "number" || isNaN(number)) {
      console.error("Error: Invalid input to add method, expected a number");
      throw new Error("Invalid input: must be a number");
    }
    this.result += number;
    console.log(`Added ${number}. New result: ${this.result}`);
    return this;
  }
  subtract(number) {
    if (typeof number !== "number" || isNaN(number)) {
      console.error(
        "Error: Invalid input to subtract method, expected a number",
      );
      throw new Error("Invalid input: must be a number");
    }
    this.result -= number;
    console.log(`Subtracted ${number}. New result: ${this.result}`);
    return this;
  }

  multiply(number) {
    if (typeof number !== "number" || isNaN(number)) {
      console.error(
        "Error: Invalid input to multiply method, expected a number",
      );
      throw new Error("Invalid input: must be a number");
    }
    this.result *= number;
    console.log(`Multiplied by ${number}. New result: ${this.result}`);
    return this;
  }

  divide(number) {
    if (typeof number !== "number" || isNaN(number)) {
      console.error("Error: Invalid input to divide method, expected a number");
      throw new Error("Invalid input: must be a number");
    }
    if (number === 0) {
      console.error("Error: Cannot divide by zero");
      throw new Error("Cannot divide by zero");
    }
    this.result /= number;
    console.log(`Divided by ${number}. New result: ${this.result}`);
    return this;
  }

  getResult() {
    return this.result;
  }

  reset() {
    this.result = 0;
    console.log(`Calculator reset. Result is now: ${this.result}`);
    return this;
  }
}
