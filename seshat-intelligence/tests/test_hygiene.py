import pytest

from seshat_intelligence.providers.hygiene import clean_text, replacement_characters


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        ("RE \u0301 GULARISATION", "RÉGULARISATION"),
        ("FONCTIONS DE COU \u0302 T", "FONCTIONS DE COÛT"),
        ("MATIE \u0300RES", "MATIÈRES"),
        ("e\u0301te\u0301", "été"),  # already attached: only normalised
        ("o\ufb03ce \ufb01n", "office fin"),
        ("co\u00adopération", "coopération"),
        ("zero\u200bwidth", "zerowidth"),
    ],
)
def test_clean_text_repairs_pdf_encoding_defects(raw, clean):
    assert clean_text(raw) == clean


def test_an_accent_over_a_math_letter_is_not_moved_to_the_word_before():
    text = "une approximation \u0302\U0001d465 de la valeur"
    assert clean_text(text) == text


def test_nothing_that_may_be_meant_is_touched():
    text = "Que voulez-vous ? Voici : une liste ; et un trait d'union en fin de ligne approxima-\nteurs."
    assert clean_text(text) == text


def test_empty_text_is_returned_as_is():
    assert clean_text("") == ""


def test_replacement_characters_are_counted():
    assert replacement_characters("a\ufffdb\ufffdc") == 2
    assert replacement_characters("clean") == 0
