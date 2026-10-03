import math

import pytest

from app.matching import score_items, text_for_item


def item(**overrides):
    result = {
        "embedding": [1.0, 0.0],
        "category": "electronics",
        "attributes": {"color": "black", "brand": "Acme"},
        "location": {"type": "Point", "coordinates": [-73.9857, 40.7484]},
    }
    result.update(overrides)
    return result


def test_identical_items_score_high():
    result = score_items(item(), item())

    assert result["score"] == pytest.approx(1.0)
    assert result["components"] == {
        "semantic": 1.0,
        "location": 1.0,
        "category": 1.0,
        "attributes": 1.0,
    }


def test_dissimilar_items_score_low():
    result = score_items(
        item(embedding=[-1.0, 0.0], category="clothing", attributes={"color": "red"}),
        item(embedding=[1.0, 0.0], category="electronics", attributes={"color": "blue"}),
    )

    assert result["score"] < 0.2


def test_location_similarity_decays_with_haversine_distance():
    origin = {"type": "Point", "coordinates": [0.0, 0.0]}
    one_degree_east = {"type": "Point", "coordinates": [1.0, 0.0]}
    result = score_items(
        item(location=origin), item(location=one_degree_east), distance_scale_km=100
    )

    expected = math.exp(-111.195 / 100)
    assert result["components"]["location"] == pytest.approx(expected, abs=0.001)


def test_no_shared_attributes_omits_component_and_renormalizes():
    result = score_items(
        item(attributes={"color": "black"}),
        item(attributes={"brand": "Acme"}),
    )

    assert "attributes" not in result["components"]
    assert result["score"] == pytest.approx(1.0)


def test_shared_attributes_score_fraction_of_equal_values():
    result = score_items(
        item(attributes={"color": "black", "brand": "Acme"}),
        item(attributes={"color": "black", "brand": "Other"}),
    )

    assert result["components"]["attributes"] == pytest.approx(0.5)


def test_incompatible_embedding_dimensions_raise_value_error():
    with pytest.raises(ValueError, match="same dimensions"):
        score_items(item(embedding=[1.0]), item(embedding=[1.0, 0.0]))


def test_zero_embedding_scores_zero_semantically():
    result = score_items(item(embedding=[0.0, 0.0]), item())

    assert result["components"]["semantic"] == 0.0


def test_text_for_item_includes_searchable_fields_and_sorted_attributes():
    text = text_for_item(
        {
            "title": "  Blue backpack ",
            "description": "Found near the station",
            "category": "bags",
            "attributes": {"size": "large", "color": "blue"},
        }
    )

    assert text == (
        "title: Blue backpack. description: Found near the station. category: bags. "
        "color: blue. size: large"
    )
