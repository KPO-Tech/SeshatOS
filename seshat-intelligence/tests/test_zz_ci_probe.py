import os  # unused on purpose: the lint step must fail


def test_the_gate_must_fail_on_this():
    assert False, "probe: this failure must turn the Gate red"
