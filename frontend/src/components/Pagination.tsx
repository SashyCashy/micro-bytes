import { Center, Pagination as MantinePagination } from '@mantine/core';

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <Center mt="xl">
      <MantinePagination
        value={currentPage}
        onChange={onPageChange}
        total={totalPages}
        aria-label="Result pages"
      />
    </Center>
  );
}
