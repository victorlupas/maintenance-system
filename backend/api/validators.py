from django.core.exceptions import ValidationError
import string

class ComplexityValidator:
    def __init__(self, min_upper=1, min_lower=1, min_digits=1, min_symbols=1):
        self.min_upper = min_upper
        self.min_lower = min_lower
        self.min_digits = min_digits
        self.min_symbols = min_symbols

    def validate(self, password, user=None):
        upper = sum(1 for c in password if c.isupper())
        lower = sum(1 for c in password if c.islower())
        digits = sum(1 for c in password if c.isdigit())
        symbols = sum(1 for c in password if c in string.punctuation)

        errors = []
        if upper < self.min_upper:
            errors.append("Password must contain at least one uppercase letter.")
        if lower < self.min_lower:
            errors.append("Password must contain at least one lowercase letter.")
        if digits < self.min_digits:
            errors.append("Password must contain at least one digit.")
        if symbols < self.min_symbols:
            errors.append("Password must contain at least one symbol.")

        if errors:
            raise ValidationError(errors)

    def get_help_text(self):
        return "Password must include uppercase, lowercase, digit, and symbol."