import { applicationError } from "./errors";

export function normalizeCsvFilename(input: string | undefined): string {
  if (input === undefined || input.trim() === "") {
    throw applicationError(
      "MISSING_FILE_NAME",
      "X-File-Name header is required.",
      400,
    );
  }

  const withoutControls = input.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const parts = withoutControls.split(/[\\/]/);
  const basename = parts[parts.length - 1]?.trim() ?? "";

  if (basename === "" || basename.length > 255) {
    throw applicationError(
      "INVALID_FILE_NAME",
      "The CSV filename is empty or too long.",
      400,
    );
  }

  if (!basename.toLowerCase().endsWith(".csv")) {
    throw applicationError(
      "INVALID_FILE_NAME",
      "Uploaded file must use a .csv extension.",
      400,
    );
  }

  return basename;
}
