import math


def clamp_page_size(page_size: int, max_page_size: int) -> int:
    return min(max(page_size, 1), max_page_size)


def offset_for_page(page: int, page_size: int) -> int:
    return (max(page, 1) - 1) * page_size


def total_pages(total_items: int, page_size: int) -> int:
    if total_items == 0:
        return 0
    return math.ceil(total_items / page_size)
