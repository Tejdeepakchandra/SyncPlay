export function ProfileLoadMoreFooter({ shown, total, canLoadMore, loadingMore, onLoadMore }) {
  return (
    <div className="pt-4 flex flex-col items-center gap-2">
      <p className="text-xs text-muted-foreground">Showing {shown} of {total}</p>
      {canLoadMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="h-10 px-4 rounded-xl border border-border text-sm text-foreground hover:bg-muted/35 transition-colors disabled:opacity-70"
        >
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}
