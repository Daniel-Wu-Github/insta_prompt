# Canonical Order Map

## Global Slot Sequence

| Slot | goal_type |
|---|---|
| 1 | context |
| 2 | tech_stack |
| 3 | constraint |
| 4 | action |
| 5 | output_format |
| 6 | edge_case |

## Enforcement Points

1. `/segment` assigns `canonical_order` from `goal_type`.
2. `/bind` sorts by `canonical_order` server-side.
3. Schema rejects values outside slot range.
4. UI presentation and bind payload preparation align to the same map.

## Drift Checks

- check shared domain map and backend map are not duplicated
- check bind route does not trust client order
- check tests include out-of-order input bind request cases
